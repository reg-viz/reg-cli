'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; // $FlowIgnore
// $FlowIgnore
// $FlowIgnore
// $FlowIgnore


var _cliSpinner = require('cli-spinner');

var _glob = require('glob');

var _glob2 = _interopRequireDefault(_glob);

var _makeDir = require('make-dir');

var _makeDir2 = _interopRequireDefault(_makeDir);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _lodash = require('lodash');

var _report = require('./report');

var _report2 = _interopRequireDefault(_report);

var _crossSpawn = require('cross-spawn');

var _crossSpawn2 = _interopRequireDefault(_crossSpawn);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _icon = require('./icon');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var IMAGE_FILES = '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

var spinner = new _cliSpinner.Spinner('[Processing].. %s');
spinner.setSpinnerString('|/-\\');

var difference = function difference(arrA, arrB) {
  return arrA.filter(function (a) {
    return !arrB.includes(a);
  });
};

var copyImages = function copyImages(actualImages, _ref) {
  var expectedDir = _ref.expectedDir,
      actualDir = _ref.actualDir;

  return Promise.all(actualImages.map(function (image) {
    return new Promise(function (resolve, reject) {
      try {
        _makeDir2.default.sync(_path2.default.dirname('' + expectedDir + image));
        var writeStream = _fs2.default.createWriteStream('' + expectedDir + image);
        _fs2.default.createReadStream('' + actualDir + image).pipe(writeStream);
        writeStream.on('finish', function (err) {
          if (err) reject(err);
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }));
};

var createDiffProcess = function createDiffProcess(params) {
  return new Promise(function (resolve, reject) {
    var args = JSON.stringify(params);
    var p = (0, _crossSpawn2.default)('node', [_path2.default.resolve(__dirname, './diff.js'), JSON.stringify(params)]);
    var data = [];
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', function (d) {
      return data.push(JSON.parse(d));
    });
    p.stderr.on('data', function (err) {
      return reject(JSON.parse(err));
    });
    p.on('exit', function () {
      resolve(data);
    });
  });
};

var compareImages = function compareImages(_ref2) {
  var expectedImages = _ref2.expectedImages,
      actualImages = _ref2.actualImages,
      dirs = _ref2.dirs,
      threshold = _ref2.threshold,
      concurrency = _ref2.concurrency;

  var images = actualImages.filter(function (actualImage) {
    return expectedImages.includes(actualImage);
  });
  var len = ~~(images.length / (concurrency || 4)) + 1;
  var chunks = (0, _lodash.chunk)(images, len);
  return Promise.all(chunks.map(function (c) {
    return createDiffProcess(_extends({}, dirs, { images: c, threshold: threshold || 0 }));
  })).then(function (res) {
    return (0, _lodash.flatten)(res);
  });
  // return bbPromise.map(images, (actualImage) => {
  //   return createDiffProcess({ ...dirs, image: actualImage, threshold: threshold || 0 });
  // }, { concurrency: concurrency || 4 });
};

var cleanupExpectedDir = function cleanupExpectedDir(expectedImages, expectedDir) {
  expectedImages.forEach(function (image) {
    return _fs2.default.unlinkSync('' + expectedDir + image);
  });
};

var aggregate = function aggregate(result) {
  var passed = result.filter(function (r) {
    return r.passed;
  }).map(function (r) {
    return r.image;
  });
  var failed = result.filter(function (r) {
    return !r.passed;
  }).map(function (r) {
    return r.image;
  });
  var diffItems = failed.map(function (image) {
    return image.replace(/\.[^\.]+$/, ".png");
  });
  return { passed: passed, failed: failed, diffItems: diffItems };
};

var updateExpected = function updateExpected(_ref3) {
  var actualDir = _ref3.actualDir,
      expectedDir = _ref3.expectedDir,
      diffDir = _ref3.diffDir,
      expectedItems = _ref3.expectedItems,
      actualItems = _ref3.actualItems;

  cleanupExpectedDir(expectedItems, expectedDir);
  return copyImages(actualItems, { actualDir: actualDir, expectedDir: expectedDir, diffDir: diffDir }).then(function () {
    _log2.default.success('\nAll images are updated. ');
  });
};

var notify = function notify(result) {
  if (result.deletedItems.length > 0) {
    _log2.default.warn('\n' + _icon.TEARDROP + ' ' + result.deletedItems.length + ' deleted images detected.');
    result.deletedItems.forEach(function (image) {
      return _log2.default.warn('  ' + _icon.MULTIPLICATION_X + ' ' + result.actualDir + image);
    });
  }

  if (result.newItems.length > 0) {
    _log2.default.info('\n' + _icon.TEARDROP + ' ' + result.newItems.length + ' new images detected.');
    result.newItems.forEach(function (image) {
      return _log2.default.info('  ' + _icon.GREEK_CROSS + ' ' + result.actualDir + image);
    });
  }

  if (result.passedItems.length > 0) {
    _log2.default.success('\n' + _icon.CHECK_MARK + ' ' + result.passedItems.length + ' test succeeded.');
    result.passedItems.forEach(function (image) {
      return _log2.default.success('  ' + _icon.CHECK_MARK + ' ' + result.actualDir + image);
    });
  }

  if (result.failedItems.length > 0) {
    _log2.default.fail('\n' + _icon.BALLOT_X + ' ' + result.failedItems.length + ' test failed.');
    result.failedItems.forEach(function (image) {
      return _log2.default.fail('  ' + _icon.BALLOT_X + ' ' + result.actualDir + image);
    });
  }
};

module.exports = function (params) {
  var actualDir = params.actualDir,
      expectedDir = params.expectedDir,
      diffDir = params.diffDir,
      update = params.update,
      json = params.json,
      concurrency = params.concurrency,
      ignoreChange = params.ignoreChange,
      report = params.report,
      urlPrefix = params.urlPrefix,
      threshold = params.threshold,
      disableUpdateMessage = params.disableUpdateMessage;

  var dirs = { actualDir: actualDir, expectedDir: expectedDir, diffDir: diffDir };

  spinner.start();

  var expectedImages = _glob2.default.sync('' + expectedDir + IMAGE_FILES).map(function (path) {
    return path.replace(expectedDir, '');
  });
  var actualImages = _glob2.default.sync('' + actualDir + IMAGE_FILES).map(function (path) {
    return path.replace(actualDir, '');
  });
  var deletedImages = difference(expectedImages, actualImages);
  var newImages = difference(actualImages, expectedImages);

  _makeDir2.default.sync(expectedDir);
  _makeDir2.default.sync(diffDir);

  return compareImages({
    expectedImages: expectedImages,
    actualImages: actualImages,
    dirs: dirs,
    threshold: threshold,
    concurrency: concurrency
  }).then(function (result) {
    return aggregate(result);
  }).then(function (_ref4) {
    var passed = _ref4.passed,
        failed = _ref4.failed,
        diffItems = _ref4.diffItems;

    return (0, _report2.default)({
      passedItems: passed,
      failedItems: failed,
      newItems: newImages,
      deletedItems: deletedImages,
      expectedItems: update ? actualImages : expectedImages,
      previousExpectedImages: expectedImages,
      actualItems: actualImages,
      diffItems: diffItems,
      json: json,
      actualDir: actualDir,
      expectedDir: expectedDir,
      diffDir: diffDir,
      report: report,
      urlPrefix: urlPrefix
    });
  }).then(function (result) {
    spinner.stop(true);
    return result;
  }).then(function (result) {
    notify(result);
    return result;
  }).then(function (result) {
    if (update) return updateExpected(result).then(function () {
      return result;
    });
    if (result.failedItems.length > 0 /* || newImages.length > 0 || deletedImages.length > 0 */) {
        if (!disableUpdateMessage) _log2.default.fail('\nInspect your code changes, re-run with `-U` to update them. ');
        if (!ignoreChange) return Promise.reject();
      }
    return result;
  }).catch(function (err) {
    _log2.default.fail(err);
    return Promise.reject(err);
  });
};