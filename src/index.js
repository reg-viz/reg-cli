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
  const images = actualImages.filter(actualImage => expectedImages.includes(actualImage));
  const debug = process.env.REG_DEBUG || false;
  
  if (debug) {
    console.log(`[INDEX] Starting comparison for ${images.length} images`);
    console.log(`[INDEX] Images to process:`, images);
  }
  
  concurrency = images.length < 20 ? 1 : concurrency || 4;
  if (debug) console.log(`[INDEX] Using concurrency level: ${concurrency}`);
  
  const processes = range(concurrency).map(() => new ProcessAdaptor(emitter));
  
  return bluebird
    .map(
      images,
      (image, index) => {
        if (debug) console.log(`[INDEX] Processing image ${index + 1}/${images.length}: ${image}`);
        
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
        } else {
          if (debug) console.warn(`[INDEX] No available process found for ${image}`);
        }
      },
      { concurrency },
    )
    .then(result => {
      if (debug) console.log(`[INDEX] Comparison completed for all ${images.length} images`);
      processes.forEach(p => p.close());
      return result;
    })
    .filter(r => !!r);
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

const aggregate = (result, emitterResults) => {
  const passed = result.filter(r => r.passed).map(r => r.image);
  const failed = result.filter(r => !r.passed).map(r => r.image);
  const diffItems = failed.map(image => image.replace(/\.[^\.]+$/, '.png'));
  
  // Create diffDetails object from emitter results
  const diffDetails = {};
  emitterResults.forEach(emitterResult => {
    if (emitterResult.diffDetails) {
      diffDetails[emitterResult.path] = emitterResult.diffDetails;
    }
  });
  
  return { passed, failed, diffItems, diffDetails };
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
  const emitterResults = []; // Collect emitter results to get diffDetails

  // Listen for compare events to collect diffDetails
  emitter.on('compare', (result) => {
    emitterResults.push(result);
  });

  const { expectedImages, actualImages, deletedImages, newImages } = findImages(expectedDir, actualDir);
  
  const debug = process.env.REG_DEBUG || false;
  if (debug) {
    console.log(`[INDEX] Image discovery results:`);
    console.log(`[INDEX] - Expected images: ${expectedImages.length}`, expectedImages.slice(0, 5));
    console.log(`[INDEX] - Actual images: ${actualImages.length}`, actualImages.slice(0, 5));
    console.log(`[INDEX] - Deleted images: ${deletedImages.length}`, deletedImages.slice(0, 5));
    console.log(`[INDEX] - New images: ${newImages.length}`, newImages.slice(0, 5));
  }

  mkdirp.sync(expectedDir);
  mkdirp.sync(diffDir);

  setImmediate(() => emitter.emit('start'));
  if (debug) console.log(`[INDEX] Starting image comparison process...`);
  
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
    .then(result => {
      if (debug) console.log(`[INDEX] Image comparison completed, aggregating results...`);
      return aggregate(result, emitterResults);
    })
    .then(({ passed, failed, diffItems, diffDetails }) => {
      if (debug) console.log(`[INDEX] Results - passed: ${passed.length}, failed: ${failed.length}, diffItems: ${diffItems.length}`);
      if (debug) console.log(`[INDEX] Creating reports...`);
      
      return createReport({
        passedItems: passed,
        failedItems: failed,
        newItems: newImages,
        deletedItems: deletedImages,
        expectedItems: update ? actualImages : expectedImages,
        actualItems: actualImages,
        diffItems,
        diffDetails, // Pass diffDetails to the report
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
      if (debug) console.log(`[INDEX] Reports created successfully`);
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
    .catch(err => {
      console.error(`[INDEX] Error in main process:`, err);
      emitter.emit('error', err);
    });

  return emitter;
};
