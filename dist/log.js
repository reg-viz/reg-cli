'use strict';

var red = '\x1B[31m';
var green = '\x1B[32m';
var yellow = '\x1B[33m';
var blue = '\x1B[34m';
var cyan = '\x1B[36m';
var reset = '\x1B[0m';

module.exports = {
  info: function info(text) {
    console.log('' + cyan + text + reset);
  },
  warn: function warn(text) {
    console.log('' + yellow + text + reset);
  },
  success: function success(text) {
    console.log('' + green + text + reset);
  },
  fail: function fail(text) {
    console.log('' + red + text + reset);
  }
};