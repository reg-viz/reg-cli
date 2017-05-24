'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var imageDiff = require('image-diff');

var _require = require('cli-spinner'),
    Spinner = _require.Spinner;

var glob = require('glob'); // $FlowIgnore
var mkdirp = require('make-dir'); // $FlowIgnore
var md5File = require('md5-file');
var fs = require('fs');
var path = require('path');
var log = require('./log');
var output = require('./report');

var _require2 = require('./icon'),
    BALLOT_X = _require2.BALLOT_X,
    CHECK_MARK = _require2.CHECK_MARK,
    TEARDROP = _require2.TEARDROP,
    MULTIPLICATION_X = _require2.MULTIPLICATION_X,
    GREEK_CROSS = _require2.GREEK_CROSS;

var IMAGE_FILES = '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

var difference = function difference(arrA, arrB) {
  return arrA.filter(function (a) {
    return !arrB.includes(a);
  });
};

var getMD5 = function getMD5(file) {
  return new Promise(function (resolve, reject) {
    md5File(file, function (err, hash) {
      if (err) reject(err);
      resolve(hash);
    });
  });
};

var compareAndCreateDiff = function compareAndCreateDiff(_ref) {
  var actualDir = _ref.actualDir,
      expectedDir = _ref.expectedDir,
      diffDir = _ref.diffDir,
      image = _ref.image,
      threshold = _ref.threshold;

  return Promise.all([getMD5('' + actualDir + image), getMD5('' + expectedDir + image)]).then(function (_ref2) {
    var _ref3 = _slicedToArray(_ref2, 2),
        actualHash = _ref3[0],
        expectedHash = _ref3[1];

    if (actualHash === expectedHash) {
      return Promise.resolve({ passed: true, image: image });
    }
    return new Promise(function (resolve, reject) {
      imageDiff.getFullResult({
        actualImage: '' + actualDir + image,
        expectedImage: '' + expectedDir + image,
        diffImage: '' + diffDir + image,
        shadow: true
      }, function (err, result) {
        if (err) {
          reject(err);
        }
        var passed = result.percentage <= threshold;
        resolve({ passed: passed, image: image });
      });
    });
  });
};

var copyImages = function copyImages(actualImages, _ref4) {
  var expectedDir = _ref4.expectedDir,
      actualDir = _ref4.actualDir;

  return Promise.all(actualImages.map(function (image) {
    return new Promise(function (resolve, reject) {
      try {
        mkdirp.sync(path.dirname('' + expectedDir + image));
        var writeStream = fs.createWriteStream('' + expectedDir + image);
        fs.createReadStream('' + actualDir + image).pipe(writeStream);
        writeStream.on('finish', function (err) {
          if (err) reject(err);
          resolve();
        });
      } catch (err) {
        log.fail(err);
        reject(err);
      }
    });
  }));
};

var compareImages = function compareImages(expectedImages, actualImages, dirs, threshold) {
  return Promise.all(actualImages.map(function (actualImage) {
    if (!expectedImages.includes(actualImage)) return;
    return compareAndCreateDiff(_extends({}, dirs, { image: actualImage, threshold: threshold }));
  }).filter(function (p) {
    return !!p;
  }));
};

var cleanupExpectedDir = function cleanupExpectedDir(expectedImages, expectedDir) {
  expectedImages.forEach(function (image) {
    return fs.unlinkSync('' + expectedDir + image);
  });
};

module.exports = function (params) {
  return new Promise(function (resolve, reject) {
    var actualDir = params.actualDir,
        expectedDir = params.expectedDir,
        diffDir = params.diffDir,
        update = params.update,
        json = params.json,
        ignoreChange = params.ignoreChange,
        report = params.report,
        urlPrefix = params.urlPrefix,
        threshold = params.threshold;

    var dirs = { actualDir: actualDir, expectedDir: expectedDir, diffDir: diffDir };
    var spinner = new Spinner('[Processing].. %s');
    spinner.setSpinnerString('|/-\\');
    spinner.start();
    var expectedImages = glob.sync('' + expectedDir + IMAGE_FILES).map(function (path) {
      return path.replace(expectedDir, '');
    });
    var actualImages = glob.sync('' + actualDir + IMAGE_FILES).map(function (path) {
      return path.replace(actualDir, '');
    });
    var deletedImages = difference(expectedImages, actualImages);
    var newImages = difference(actualImages, expectedImages);

    mkdirp.sync(expectedDir);
    mkdirp.sync(diffDir);

    if (deletedImages.length > 0) {
      log.warn('\n' + TEARDROP + ' ' + deletedImages.length + ' deleted images detected.');
      deletedImages.forEach(function (image) {
        return log.warn('  ' + MULTIPLICATION_X + ' ' + actualDir + image);
      });
    }

    if (newImages.length > 0) {
      log.warn('\n' + TEARDROP + ' ' + newImages.length + ' new images detected.');
      newImages.forEach(function (image) {
        return log.info('  ' + GREEK_CROSS + ' ' + actualDir + image);
      });
    }

    return compareImages(expectedImages, actualImages, dirs, threshold).then(function (results) {
      var passed = results.filter(function (r) {
        return r.passed;
      }).map(function (r) {
        return r.image;
      });
      var failed = results.filter(function (r) {
        return !r.passed;
      }).map(function (r) {
        return r.image;
      });

      var result = output({
        passedItems: passed,
        failedItems: failed,
        newItems: newImages,
        deletedItems: deletedImages,
        expectedItems: update ? actualImages : expectedImages,
        previousExpectedImages: expectedImages,
        actualItems: actualImages,
        diffItems: failed,
        json: json,
        actualDir: actualDir,
        expectedDir: expectedDir,
        diffDir: diffDir,
        report: report,
        urlPrefix: urlPrefix
      });

      spinner.stop(true);

      if (passed.length > 0) {
        log.success('\n' + CHECK_MARK + ' ' + passed.length + ' test succeeded.');
        passed.forEach(function (image) {
          return log.success('  ' + CHECK_MARK + ' ' + actualDir + image);
        });
      }

      if (failed.length > 0) {
        log.fail('\n' + BALLOT_X + ' ' + failed.length + ' test failed.');
        failed.forEach(function (image) {
          return log.fail('  ' + BALLOT_X + ' ' + actualDir + image);
        });
      }

      if (update) {
        cleanupExpectedDir(expectedImages, expectedDir);
        copyImages(actualImages, dirs).then(function () {
          log.success('\nAll images are updated. ');
          resolve(result);
        });
      } else {
        // TODO: add fail option
        if (failed.length > 0 /* || newImages.length > 0 || deletedImages.length > 0 */) {
            log.fail('\nInspect your code changes, re-run with `-U` to update them. ');
            if (!ignoreChange) process.exit(1);
            return;
          }
      }
    }).catch(function (err) {
      log.fail(err);
      process.exit(1);
    });
  });
};