/* @flow */

const { imgDiff } = require('img-diff-js');
const { Spinner } = require('cli-spinner');
const glob = require('glob'); // $FlowIgnore
const mkdirp = require('make-dir'); // $FlowIgnore
const md5File = require('md5-file');
const fs = require('fs');
const path = require('path');
const log = require('./log');
const output = require('./report');
const { BALLOT_X, CHECK_MARK, TEARDROP, MULTIPLICATION_X, GREEK_CROSS } = require('./icon');
const IMAGE_FILES = '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

type CompareResult = {
  passed: boolean;
  image: string;
};

type Params = {
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  update: boolean;
  ignoreChange: boolean;
  report: string | boolean;
  json: string;
  urlPrefix: string;
  threshold: number;
};

type DiffCreatorParams = {
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  image: string;
  threshold: number;
}

const difference = (arrA, arrB) => arrA.filter(a => !arrB.includes(a));

const getMD5 = (file) => new Promise((resolve, reject) => {
  md5File(file, (err, hash) => {
    if (err) reject(err);
    resolve(hash);
  })
});

const compareAndCreateDiff = ({ actualDir, expectedDir, diffDir, image, threshold }: DiffCreatorParams): Promise<CompareResult> => {
  return Promise.all([
    getMD5(`${actualDir}${image}`),
    getMD5(`${expectedDir}${image}`),
  ]).then(([actualHash, expectedHash]) => {
    if (actualHash === expectedHash) {
      return Promise.resolve({ passed: true, image });
    }
    const diffImage = image.replace(/\.[^\.]+$/, ".png");
    return imgDiff({
      actualFilename: `${actualDir}${image}`,
      expectedFilename: `${expectedDir}${image}`,
      diffFilename: `${diffDir}${diffImage}`,
      options: {
        threshold,
      },
      // metric: 'RMSE',
    })
      .then((result) => {
        const passed = result.imagesAreSame;
        return { passed, image };
      })
      .catch((e) => {
        Promise.reject(e);
      })
  })
};

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
      log.fail(err);
      reject(err);
    }
  })))
};

const compareImages = (
  expectedImages: string[],
  actualImages: string[],
  dirs,
  threshold,
): Promise<$TupleMap<CompareResult[], typeof $await>> => {
  return Promise.all(
    actualImages
      .filter((actualImage) => expectedImages.includes(actualImage))
      .map((actualImage) => compareAndCreateDiff({ ...dirs, image: actualImage, threshold }))
  );
};

const cleanupExpectedDir = (expectedImages, expectedDir) => {
  expectedImages.forEach((image) => fs.unlinkSync(`${expectedDir}${image}`));
};

module.exports = (params: Params) => {
  const { actualDir, expectedDir, diffDir, update, json,
    ignoreChange, report, urlPrefix, threshold } = params;
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
    log.warn(`\n${TEARDROP} ${newImages.length} new images detected.`);
    newImages.forEach((image) => log.info(`  ${GREEK_CROSS} ${actualDir}${image}`));
  }

  return compareImages(expectedImages, actualImages, dirs, threshold)
    .then((results) => {
      const passed = results.filter(r => r.passed).map((r) => r.image);
      const failed = results.filter(r => !r.passed).map((r) => r.image);
      const diffItems = failed.map(image => image.replace(/\.[^\.]+$/, ".png"));

      const result = output({
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
        // TODO: add fail option
        if (failed.length > 0 /* || newImages.length > 0 || deletedImages.length > 0 */) {
          log.fail(`\nInspect your code changes, re-run with \`-U\` to update them. `);
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

