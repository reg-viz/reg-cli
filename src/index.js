/* @flow */

import { Spinner } from 'cli-spinner';
import glob from 'glob'; // $FlowIgnore
import mkdirp from 'make-dir'; // $FlowIgnore
import fs from 'fs';
import path from 'path';
import { range } from 'lodash';
import log from './log';
import createReport from './report';
import bluebird from 'bluebird'; // $FlowIgnore
import spawn from 'cross-spawn';
import ProcessAdaptor from './process-adaptor';
import type { DiffCreatorParams } from './diff';
import { BALLOT_X, CHECK_MARK, TEARDROP, MULTIPLICATION_X, GREEK_CROSS } from './icon';

const IMAGE_FILES = '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

type CompareResult = {
  passed: boolean;
  image: string;
};

type RegParams = {
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  update?: boolean;
  ignoreChange?: boolean;
  report?: string;
  json?: string;
  urlPrefix?: string;
  threshold?: number;
  disableUpdateMessage?: boolean;
  concurrency?: number;
};

const spinner = new Spinner('[Processing].. %s');
spinner.setSpinnerString('|/-\\');

const difference = (arrA, arrB) => arrA.filter(a => !arrB.includes(a));

const copyImages = (actualImages, { expectedDir, actualDir }) => {
  return Promise.all(actualImages.map((image) => new Promise((resolve, reject) => {
    try {
      mkdirp.sync(path.dirname(`${expectedDir}${image}`));
      const writeStream = fs.createWriteStream(`${expectedDir}${image}`);
      fs.createReadStream(`${actualDir}${image}`).pipe(writeStream);
      writeStream.on('finish', (err) => {
        if (err) reject(err);
        resolve();
      })
    } catch (err) {
      reject(err);
    }
  })))
};

const compareImages = ({
  expectedImages,
  actualImages,
  dirs,
  threshold,
  concurrency,
}): Promise<CompareResult[]> => {
  const images = actualImages.filter((actualImage) => expectedImages.includes(actualImage));
  concurrency = images.length < 20 ? 1 : concurrency || 4;
  const processes = range(concurrency).map(() => new ProcessAdaptor());
  return bluebird.map(images, (image) => {
    const p = processes.find(p => !p.isRunning());
    if (p) {
      return p.run({ ...dirs, image, threshold: threshold || 0 });
    }
  }, { concurrency }).then((result) => {
    processes.forEach((p) => p.close());
    return result;
  }).filter(r => !!r);
};

const cleanupExpectedDir = (expectedImages, expectedDir) => {
  expectedImages.forEach((image) => fs.unlinkSync(`${expectedDir}${image}`));
};

const aggregate = (result) => {
  const passed = result.filter(r => r.passed).map((r) => r.image);
  const failed = result.filter(r => !r.passed).map((r) => r.image);
  const diffItems = failed.map(image => image.replace(/\.[^\.]+$/, ".png"));
  return { passed, failed, diffItems };
};

const updateExpected = ({ actualDir, expectedDir, diffDir, expectedItems, actualItems }) => {
  cleanupExpectedDir(expectedItems, expectedDir);
  return copyImages(actualItems, { actualDir, expectedDir, diffDir }).then(() => {
    log.success(`\nAll images are updated. `);
  });
};

const notify = (result) => {
  if (result.deletedItems.length > 0) {
    log.warn(`\n${TEARDROP} ${result.deletedItems.length} deleted images detected.`);
    result.deletedItems.forEach((image) => log.warn(`  ${MULTIPLICATION_X} ${result.actualDir}${image}`));
  }

  if (result.newItems.length > 0) {
    log.info(`\n${TEARDROP} ${result.newItems.length} new images detected.`);
    result.newItems.forEach((image) => log.info(`  ${GREEK_CROSS} ${result.actualDir}${image}`));
  }

  if (result.passedItems.length > 0) {
    log.success(`\n${CHECK_MARK} ${result.passedItems.length} test succeeded.`);
    result.passedItems.forEach((image) => log.success(`  ${CHECK_MARK} ${result.actualDir}${image}`));
  }

  if (result.failedItems.length > 0) {
    log.fail(`\n${BALLOT_X} ${result.failedItems.length} test failed.`);
    result.failedItems.forEach((image) => log.fail(`  ${BALLOT_X} ${result.actualDir}${image}`));
  }
}

export default (params: RegParams) => {
  const { actualDir, expectedDir, diffDir, update, json, concurrency,
    ignoreChange, report, urlPrefix, threshold, disableUpdateMessage } = params;
  const dirs = { actualDir, expectedDir, diffDir };

  spinner.start();

  const expectedImages = glob.sync(`${expectedDir}${IMAGE_FILES}`).map(path => path.replace(expectedDir, ''));
  const actualImages = glob.sync(`${actualDir}${IMAGE_FILES}`).map(path => path.replace(actualDir, ''));
  const deletedImages = difference(expectedImages, actualImages);
  const newImages = difference(actualImages, expectedImages);

  mkdirp.sync(expectedDir);
  mkdirp.sync(diffDir);

  return compareImages({
    expectedImages,
    actualImages,
    dirs,
    threshold,
    concurrency,
  })
    .then((result) => aggregate(result))
    .then(({ passed, failed, diffItems }) => {
      return createReport({
        passedItems: passed,
        failedItems: failed,
        newItems: newImages,
        deletedItems: deletedImages,
        expectedItems: update ? actualImages : expectedImages,
        previousExpectedImages: expectedImages,
        actualItems: actualImages,
        diffItems,
        json: json || './reg.json',
        actualDir,
        expectedDir,
        diffDir,
        report: report || '',
        urlPrefix: urlPrefix || '',
      });
    })
    .then((result) => {
      spinner.stop(true);
      return result;
    })
    .then((result) => {
      notify(result);
      return result;
    })
    .then((result) => {
      if (update) return updateExpected(result).then(() => result);
      if (result.failedItems.length > 0 /* || newImages.length > 0 || deletedImages.length > 0 */) {
        if (!disableUpdateMessage) log.fail(`\nInspect your code changes, re-run with \`-U\` to update them. `);
        if (!ignoreChange) return Promise.reject();
      }
      return result;
    })
    .catch(err => {
      log.fail(err);
      return Promise.reject(err);
    });
};

