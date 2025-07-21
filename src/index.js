/* @flow */

import glob from 'glob'; // $FlowIgnore
import mkdirp from 'make-dir'; // $FlowIgnore
import del from 'del'; // $FlowIgnore
import fs from 'fs';
import path from 'path';
import { range } from 'lodash';
import log from './log';
import createReport from './report';
// $FlowIgnore
import bluebird from 'bluebird';
import EventEmitter from 'events';
import ProcessAdaptor from './process-adaptor';
import type { DiffCreatorParams } from './diff';
import { findImages } from './image-finder';
import { initTracing, createSpan, shutdownTracing } from './tracing';

type CompareResult = {
  passed: boolean,
  image: string,
};

type RegParams = {
  actualDir: string,
  expectedDir: string,
  diffDir: string,
  report?: string,
  junitReport?: string,
  json?: string,
  update?: boolean,
  extendedErrors?: boolean,
  urlPrefix?: string,
  matchingThreshold?: number,
  threshold?: number, // alias to thresholdRate.
  thresholdRate?: number,
  thresholdPixel?: number,
  concurrency?: number,
  enableAntialias?: boolean,
  enableClientAdditionalDetection?: boolean,
};

const copyImages = (actualImages, { expectedDir, actualDir }) => {
  return createSpan('copyImages', () => {
    return Promise.all(
      actualImages.map(
        image =>
          new Promise((resolve, reject) => {
            try {
              mkdirp.sync(path.dirname(path.join(expectedDir, image)));
              const writeStream = fs.createWriteStream(path.join(expectedDir, image));
              fs.createReadStream(path.join(actualDir, image)).pipe(writeStream);
              writeStream.on('finish', err => {
                if (err) reject(err);
                resolve();
              });
            } catch (err) {
              reject(err);
            }
          }),
      ),
    );
  });
};

const compareImages = (
  emitter,
  {
    expectedImages,
    actualImages,
    dirs,
    matchingThreshold,
    thresholdPixel,
    thresholdRate,
    concurrency,
    enableAntialias,
  },
): Promise<CompareResult[]> => {
  return createSpan('compareImages', () => {
    const images = actualImages.filter(actualImage => expectedImages.includes(actualImage));
    
    // concurrency が 0 の場合は直接実行（テスト用）
    if (concurrency === 0) {
      // createDiffを直接importして実行
      const { imgDiff } = require('img-diff-js');
      const md5File = require('md5-file');
      
      return Promise.all(images.map(image => {
        return createSpan(`createDiff-${image}`, () => {
          const getMD5 = (file) => new Promise((resolve, reject) => {
            md5File(file, (err, hash) => {
              if (err) reject(err);
              resolve(hash);
            })
          });
          
          const isPassed = ({ width, height, diffCount, thresholdPixel, thresholdRate }) => {
            if (typeof thresholdPixel === "number") {
              return diffCount <= thresholdPixel;
            } else if (typeof thresholdRate === "number") {
              const totalPixel = width * height;
              const ratio = diffCount / totalPixel;
              return ratio <= thresholdRate;
            }
            return diffCount === 0;
          };
          
          return Promise.all([
            getMD5(path.join(dirs.actualDir, image)),
            getMD5(path.join(dirs.expectedDir, image)),
          ]).then(([actualHash, expectedHash]) => {
            if (actualHash === expectedHash) {
              emitter.emit('compare', { type: 'pass', path: image });
              return { passed: true, image };
            }
            const diffImage = image.replace(/\.[^\.]+$/, ".png");
            return imgDiff({
              actualFilename: path.join(dirs.actualDir, image),
              expectedFilename: path.join(dirs.expectedDir, image),
              diffFilename: path.join(dirs.diffDir, diffImage),
              options: {
                threshold: matchingThreshold,
                includeAA: !enableAntialias,
              },
            })
              .then(({ width, height, diffCount }) => {
                const passed = isPassed({ width, height, diffCount, thresholdPixel, thresholdRate });
                emitter.emit('compare', { 
                  type: passed ? 'pass' : 'fail', 
                  path: image 
                });
                return { passed, image };
              })
          });
        });
      }));
    }
    
    // 通常の並行処理モード
    concurrency = images.length < 20 ? 1 : concurrency || 4;
    const processes = range(concurrency).map(() => new ProcessAdaptor(emitter));
    return bluebird
      .map(
        images,
        image => {
          const p = processes.find(p => !p.isRunning());
          if (p) {
            return p.run({
              ...dirs,
              image,
              matchingThreshold,
              thresholdRate,
              thresholdPixel,
              enableAntialias,
            });
          }
        },
        { concurrency },
      )
      .then(result => {
        processes.forEach(p => p.close());
        return result;
      })
      .filter(r => !!r);
  });
};

const cleanupExpectedDir = (expectedDir, changedFiles) => {
  const paths = changedFiles.map(image => {
    const directories = expectedDir.split("\\");
    return escapeGlob(path.posix.join(...directories, image));
  });
  // force: true needed to allow deleting outside working directory
  return del(paths, { force: true });
};

const escapeGlob = fileName => {
  return fileName
    .replace(/(\*)/g, '[$1]')
    .replace(/(\*)/g, '[$1]')
    .replace(/(\?)/g, '[$1]')
    .replace(/(\[)/g, '[$1]')
    .replace(/(\])/g, '[$1]')
    .replace(/(\{)/g, '[$1]')
    .replace(/(\})/g, '[$1]')
    .replace(/(\))/g, '[$1]')
    .replace(/(\()/g, '[$1]')
    .replace(/(\!)/g, '[$1]');
};

const aggregate = result => {
  const passed = result.filter(r => r.passed).map(r => r.image);
  const failed = result.filter(r => !r.passed).map(r => r.image);
  const diffItems = failed.map(image => image.replace(/\.[^\.]+$/, '.png'));
  return { passed, failed, diffItems };
};

const updateExpected = ({ actualDir, expectedDir, diffDir, deletedImages, newImages, diffItems }) => {
  return cleanupExpectedDir(expectedDir, [...deletedImages, ...diffItems])
    .then(() =>
      copyImages([...newImages, ...diffItems], {
        actualDir,
        expectedDir,
        diffDir,
      }),
    )
    .then(() => {
      log.success(`\nAll images are updated. `);
    });
};

module.exports = (params: RegParams) => {
  initTracing();
  
  return createSpan('reg-cli-main', () => {
    const {
      actualDir,
      expectedDir,
      diffDir,
      json,
      concurrency = 4,
      update,
      report,
      junitReport,
      extendedErrors,
      urlPrefix,
      threshold,
      matchingThreshold = 0,
      thresholdRate,
      thresholdPixel,
      enableAntialias,
      enableClientAdditionalDetection,
    } = params;
    const dirs = { actualDir, expectedDir, diffDir };
    const emitter = new EventEmitter();

    const { expectedImages, actualImages, deletedImages, newImages } = findImages(expectedDir, actualDir);

    mkdirp.sync(expectedDir);
    mkdirp.sync(diffDir);

    setImmediate(() => emitter.emit('start'));
    compareImages(emitter, {
      expectedImages,
      actualImages,
      dirs,
      matchingThreshold,
      thresholdRate: thresholdRate || threshold,
      thresholdPixel,
      concurrency,
      enableAntialias: !!enableAntialias,
    })
      .then(result => aggregate(result))
      .then(({ passed, failed, diffItems }) => {
        return createReport({
          passedItems: passed,
          failedItems: failed,
          newItems: newImages,
          deletedItems: deletedImages,
          expectedItems: update ? actualImages : expectedImages,
          actualItems: actualImages,
          diffItems,
          json: json || './reg.json',
          actualDir,
          expectedDir,
          diffDir,
          report: report || '',
          junitReport: junitReport || '',
          extendedErrors: !!extendedErrors,
          urlPrefix: urlPrefix || '',
          enableClientAdditionalDetection: !!enableClientAdditionalDetection,
        });
      })
      .then(result => {
        deletedImages.forEach(image => emitter.emit('compare', { type: 'delete', path: image }));
        newImages.forEach(image => emitter.emit('compare', { type: 'new', path: image }));
        if (update) {
          return updateExpected({
            actualDir,
            expectedDir,
            diffDir,
            deletedImages,
            newImages,
            diffItems: result.diffItems,
          }).then(() => {
            emitter.emit('update');
            return result;
          });
        }
        return result;
      })
      .then(result => emitter.emit('complete', result))
      .catch(err => emitter.emit('error', err));

    return emitter;
  });
};

// shutdownTracing関数もexportする
module.exports.shutdownTracing = shutdownTracing;
