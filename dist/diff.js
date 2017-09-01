'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _require = require('img-diff-js'),
    imgDiff = _require.imgDiff; // $FlowIgnore


var md5File = require('md5-file'); // $FlowIgnore

var getMD5 = function getMD5(file) {
  return new Promise(function (resolve, reject) {
    md5File(file, function (err, hash) {
      if (err) reject(err);
      resolve(hash);
    });
  });
};

var createDiff = function createDiff(_ref) {
  var actualDir = _ref.actualDir,
      expectedDir = _ref.expectedDir,
      diffDir = _ref.diffDir,
      images = _ref.images,
      threshold = _ref.threshold;

  images.forEach(function (image) {
    return Promise.all([getMD5('' + actualDir + image), getMD5('' + expectedDir + image)]).then(function (_ref2) {
      var _ref3 = _slicedToArray(_ref2, 2),
          actualHash = _ref3[0],
          expectedHash = _ref3[1];

      if (actualHash === expectedHash) {
        return process.stdout.write(JSON.stringify({ passed: true, image: image }));
      }
      var diffImage = image.replace(/\.[^\.]+$/, ".png");
      return imgDiff({
        actualFilename: '' + actualDir + image,
        expectedFilename: '' + expectedDir + image,
        diffFilename: '' + diffDir + diffImage,
        options: {
          threshold: threshold
        }
      }).then(function (result) {
        var passed = result.imagesAreSame;
        process.stdout.write(JSON.stringify({ passed: passed, image: image }));
      }).catch(function (e) {
        process.stderr.write(JSON.stringify(e));
      });
    });
  });
};

createDiff(JSON.parse(process.argv[2]));