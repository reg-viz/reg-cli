/* @flow */

const imageDiff = require('image-diff');
const Spinner = require('cli-spinner').Spinner;
const glob = require('glob');
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const log = require('./log');
const report = require('./report');

const IMAGE_FILES= '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

const difference = (arrA, arrB) => arrA.filter(a => !arrB.includes(a));

type CompareResult = {
  passed: boolean;
  image: string;
};

type Props = {
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  update: ?boolean;
  reportPath: ?string | boolean;
};

module.exports = ({
  actualDir,
  expectedDir,
  diffDir,
  update,
  reportPath,
}: Props) => new Promise((resolve, reject) => {
  let spinner = new Spinner('[Processing].. %s');
  spinner.setSpinnerString('|/-\\');
  spinner.start();
  const expectedImages = glob.sync(`${expectedDir}${IMAGE_FILES}`)
          .map(path => path.replace(expectedDir, ''));
  const actualImages = glob.sync(`${actualDir}${IMAGE_FILES}`)
          .map(path => path.replace(actualDir, ''));
  const deletedImages = difference(expectedImages, actualImages);
  const newImages = difference(actualImages, expectedImages);

  mkdirp.sync(expectedDir);
  mkdirp.sync(diffDir);

  const compareAndGenerateDiff = (
    actualDir: string,
    expectedDir: string,
    diffDir: string,
    image: string,
  ): Promise<CompareResult> => {
    return new Promise((resolve, reject) => {
      imageDiff({
        actualImage: `${actualDir}${image}`,
        expectedImage: `${expectedDir}${image}`,
        diffImage: `${diffDir}${image}`,
        shadow: true,
      }, (err, imagesAreSame) => {
        if (err) reject(err);
        resolve({ passed: imagesAreSame, image });
      })
    })
  };

  const compareImages = (
    expectedImages: string[],
    actualImages: string[]
  ): Promise<$TupleMap<CompareResult[], typeof $await>> => {
    return Promise.all(actualImages.map((actualImage) => {
      if (!expectedImages.includes(actualImage)) return;
      return compareAndGenerateDiff(
        actualDir,
        expectedDir,
        diffDir,
        actualImage,
      )
    }).filter(p => !!p))
  };

  const cleanupExpectedDir = () => {
    expectedImages.forEach((image) => fs.unlinkSync(`${expectedDir}${image}`));
  };

  const copyImages = () => {
    actualImages.forEach((image) => {
      try {
        mkdirp.sync(path.dirname(`${expectedDir}${image}`));
        fs.createReadStream(`${actualDir}${image}`)
          .pipe(fs.createWriteStream(`${expectedDir}${image}`));
      } catch(err) {
        log.fail(err);
      }
    })
  };

  if (deletedImages.length > 0) {
    log.warn(`\n\u274B ${deletedImages.length} deleted images detected.`);
    deletedImages.forEach((image) => log.warn(`  \u2716 ${actualDir}${image}`));
  }

  if (newImages.length > 0) {
    log.info(`\n\u274B ${newImages.length} new images detected.`);
    newImages.forEach((image) => log.info(`  \u271A ${actualDir}${image}`));
  }

  compareImages(expectedImages, actualImages)
    .then((results) => {
      const passed = results.filter(r => r.passed).map((r) => r.image);
      const failed = results.filter(r => !r.passed).map((r) => r.image);

      if (reportPath) {
        report({
          passedItems: passed,
          failedItems: failed,
          newItems: newImages,
          deletedItems: deletedImages,
          reportPath,
          actualDir,
          expectedDir,
          diffDir,
        });
      }

      spinner.stop(true);
      if (passed.length > 0) {
        log.success(`\n\u2714 ${passed.length} test succeeded.`);
        passed.forEach((image) => {
          try {
            fs.unlinkSync(`${diffDir}${image}`);
          } catch(err) {
            // noop
          }
          log.success(`  \u2714 ${actualDir}${image}`);
        });
      }

      if (failed.length > 0) {
        log.fail(`\n\u2718 ${failed.length} test failed.`);
        failed.forEach((image) => log.fail(`  \u2718 ${actualDir}${image}`));
      }

      if (!update) {
        if (failed.length > 0 || newImages.length > 0 || deletedImages.length > 0) {
          log.fail(`\nInspect your code changes, re-run with \`-U\` to update them. `);
          process.exit(1);
        }
      }

      spinner.start();
      cleanupExpectedDir();
      copyImages();
      log.success(`\nAll images are updated. `);
      spinner.stop(true);
    })
    .catch(err => {
      log.fail(err);
      process.exit(1);
    });
});

