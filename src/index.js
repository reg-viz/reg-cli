/* @flow */

const imageDiff = require('image-diff');
const { Spinner } = require('cli-spinner');
const glob = require('glob');
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const log = require('./log');
const output = require('./report');

const IMAGE_FILES = '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

const BALLOT_X = '\u2718';
const CHECK_MARK = '\u2714';
const TEARDROP = '\u274B';
const MULTIPLICATION_X = '\u2716';
const GREEK_CROSS = '\u271A';

const difference = (arrA, arrB) => arrA.filter(a => !arrB.includes(a));

type CompareResult = {
  passed: boolean;
  image: string;
};

type Params = {
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  update: boolean;
  ignoreError: boolean;
  report: string | boolean;
  json: string;
};

type DiffCreatorParams = {
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  image: string;
}

module.exports = (params: Params) => new Promise((resolve, reject) => {
  const { actualDir, expectedDir, diffDir, update, json, ignoreError, report } = params;
  let spinner = new Spinner('[Processing].. %s');
  spinner.setSpinnerString('|/-\\');
  spinner.start();
  const expectedImages = glob.sync(`${expectedDir}${IMAGE_FILES}`).map(path => path.replace(expectedDir, ''));
  const actualImages = glob.sync(`${actualDir}${IMAGE_FILES}`).map(path => path.replace(actualDir, ''));
  const deletedImages = difference(expectedImages, actualImages);
  const newImages = difference(actualImages, expectedImages);

  mkdirp.sync(expectedDir);
  mkdirp.sync(diffDir);

  const compareAndCreateDiff = ({ actualDir, expectedDir, diffDir, image }: DiffCreatorParams): Promise<CompareResult> => {
    return new Promise((resolve, reject) => {
      imageDiff({
        actualImage: `${actualDir}${image}`,
        expectedImage: `${expectedDir}${image}`,
        diffImage: `${diffDir}${image}`,
        shadow: true,
      }, (err, imagesAreSame) => {
        if (err) {
          reject(err);
        }
        resolve({ passed: imagesAreSame, image });
      })
    })
  };

  const compareImages = (expectedImages: string[], actualImages: string[]): Promise<$TupleMap<CompareResult[], typeof $await>> => {
    return Promise.all(actualImages.map((actualImage) => {
      if (!expectedImages.includes(actualImage)) return;
      return compareAndCreateDiff({
        actualDir,
        expectedDir,
        diffDir,
        image: actualImage,
      })
    }).filter(p => !!p))
  };

  const cleanupExpectedDir = () => {
    expectedImages.forEach((image) => fs.unlinkSync(`${expectedDir}${image}`));
  };

  const copyImages = () => {
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
        log.fail(err);
        reject(err);
      }
    })))
  };

  if (deletedImages.length > 0) {
    log.warn(`\n${TEARDROP} ${deletedImages.length} deleted images detected.`);
    deletedImages.forEach((image) => log.warn(`  ${MULTIPLICATION_X} ${actualDir}${image}`));
  }

  if (newImages.length > 0) {
    log.warn(`\n${TEARDROP} ${newImages.length} new images detected.`);
    newImages.forEach((image) => log.info(`  ${GREEK_CROSS} ${actualDir}${image}`));
  }

  return compareImages(expectedImages, actualImages)
    .then((results) => {
      const passed = results.filter(r => r.passed).map((r) => r.image);
      const failed = results.filter(r => !r.passed).map((r) => r.image);

      const result = output({
        passedItems: passed,
        failedItems: failed,
        newItems: newImages,
        deletedItems: deletedImages,
        expectedItems: update ? actualImages : expectedImages,
        previousExpectedImages: expectedImages,
        actualItems: actualImages,
        diffItems: failed,
        json,
        actualDir,
        expectedDir,
        diffDir,
        report,
      });
      spinner.stop(true);
      if (passed.length > 0) {
        log.success(`\n${CHECK_MARK} ${passed.length} test succeeded.`);
        passed.forEach((image) => {
          try {
            fs.unlinkSync(`${diffDir}${image}`);
          } catch (err) {
            // NOP
          }
          log.success(`  ${CHECK_MARK} ${actualDir}${image}`);
        });
      }

      if (failed.length > 0) {
        log.fail(`\n${BALLOT_X} ${failed.length} test failed.`);
        failed.forEach((image) => log.fail(`  ${BALLOT_X} ${actualDir}${image}`));
      }

      if (update) {
        spinner.start();
        cleanupExpectedDir();
        copyImages().then(() => {
          log.success(`\nAll images are updated. `);
          spinner.stop(true);
          resolve(result);
        })
      } else {
        // TODO: add fail option
        if (failed.length > 0 /* || newImages.length > 0 || deletedImages.length > 0 */) {
          log.fail(`\nInspect your code changes, re-run with \`-U\` to update them. `);
          if (!ignoreError) process.exit(1);
          return;
        }
      }
    })
    .catch(err => {
      log.fail(err);
      process.exit(1);
    });
});

