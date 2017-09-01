/* @flow */

const { Spinner } = require('cli-spinner');
const glob = require('glob'); // $FlowIgnore
const mkdirp = require('make-dir'); // $FlowIgnore
const fs = require('fs');
const path = require('path');
const log = require('./log');
const createReport = require('./report');
const spawn = require('cross-spawn');

const { BALLOT_X, CHECK_MARK, TEARDROP, MULTIPLICATION_X, GREEK_CROSS } = require('./icon');
const IMAGE_FILES = '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

type CompareResult = {
  passed: boolean;
  image: string;
};

type RegParams = {
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  update: boolean;
  ignoreChange: boolean;
  report: string | boolean;
  json: string;
  urlPrefix: string;
  threshold: number;
  disableUpdateMessage: boolean;
};

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

const createDiffProcess = (params: DiffCreatorParams) => new Promise((resolve, reject) => {
  const args = JSON.stringify(params);
  const p = spawn('node', [path.resolve(__dirname, './diff.js'), JSON.stringify(params)]);
  let data = '';
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', d => data += d);
  p.stderr.on('data', err => reject(JSON.parse(err)));
  p.on('exit', () => {
    resolve(JSON.parse(data));
  });
});

const compareImages = (
  expectedImages: string[],
  actualImages: string[],
  dirs,
  threshold,
): Promise<$TupleMap<CompareResult[], typeof $await>> => {
  return Promise.all(
    actualImages
      .filter((actualImage) => expectedImages.includes(actualImage))
      // .map((actualImage) => compareAndCreateDiff({ ...dirs, image: actualImage, threshold }))
      .map((actualImage) => createDiffProcess({ ...dirs, image: actualImage, threshold }))
  );
};

const cleanupExpectedDir = (expectedImages, expectedDir) => {
  expectedImages.forEach((image) => fs.unlinkSync(`${expectedDir}${image}`));
};

module.exports = (params: RegParams) => {
  const { actualDir, expectedDir, diffDir, update, json,
    ignoreChange, report, urlPrefix, threshold, disableUpdateMessage } = params;
  const dirs = { actualDir, expectedDir, diffDir };

  let spinner = new Spinner('[Processing].. %s');
  spinner.setSpinnerString('|/-\\');
  spinner.start();

  const expectedImages = glob.sync(`${expectedDir}${IMAGE_FILES}`).map(path => path.replace(expectedDir, ''));
  const actualImages = glob.sync(`${actualDir}${IMAGE_FILES}`).map(path => path.replace(actualDir, ''));
  const deletedImages = difference(expectedImages, actualImages);
  const newImages = difference(actualImages, expectedImages);

  mkdirp.sync(expectedDir);
  mkdirp.sync(diffDir);

  if (deletedImages.length > 0) {
    log.warn(`\n${TEARDROP} ${deletedImages.length} deleted images detected.`);
    deletedImages.forEach((image) => log.warn(`  ${MULTIPLICATION_X} ${actualDir}${image}`));
  }

  if (newImages.length > 0) {
    log.info(`\n${TEARDROP} ${newImages.length} new images detected.`);
    newImages.forEach((image) => log.info(`  ${GREEK_CROSS} ${actualDir}${image}`));
  }

  return compareImages(expectedImages, actualImages, dirs, threshold)
    .then((results) => {
      const passed = results.filter(r => r.passed).map((r) => r.image);
      const failed = results.filter(r => !r.passed).map((r) => r.image);
      const diffItems = failed.map(image => image.replace(/\.[^\.]+$/, ".png"));

      const result = createReport({
        passedItems: passed,
        failedItems: failed,
        newItems: newImages,
        deletedItems: deletedImages,
        expectedItems: update ? actualImages : expectedImages,
        previousExpectedImages: expectedImages,
        actualItems: actualImages,
        diffItems,
        json,
        actualDir,
        expectedDir,
        diffDir,
        report,
        urlPrefix,
      });

      spinner.stop(true);

      if (passed.length > 0) {
        log.success(`\n${CHECK_MARK} ${passed.length} test succeeded.`);
        passed.forEach((image) => log.success(`  ${CHECK_MARK} ${actualDir}${image}`));
      }

      if (failed.length > 0) {
        log.fail(`\n${BALLOT_X} ${failed.length} test failed.`);
        failed.forEach((image) => log.fail(`  ${BALLOT_X} ${actualDir}${image}`));
      }

      if (update) {
        cleanupExpectedDir(expectedImages, expectedDir);
        return copyImages(actualImages, dirs).then(() => {
          log.success(`\nAll images are updated. `);
        });
      } else {
        if (failed.length > 0 /* || newImages.length > 0 || deletedImages.length > 0 */) {
          if (!disableUpdateMessage) log.fail(`\nInspect your code changes, re-run with \`-U\` to update them. `);
          if (!ignoreChange) return Promise.reject();
        }
      }
      return result;
    })
    .catch(err => {
      log.fail(err);
      return Promise.reject(err);
    });
};

