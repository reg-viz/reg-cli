'use strict';

var Mustache = require('mustache');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var log = require('./log');

var loadFaviconAsDataURL = function loadFaviconAsDataURL(type) {
  var fname = path.resolve(__dirname, '../report/assets/favicon_' + type + '.png');
  var buffer = fs.readFileSync(fname);
  return 'data:image/png;base64,' + buffer.toString('base64');
};

var createJSONReport = function createJSONReport(params) {
  return {
    failedItems: params.failedItems,
    newItems: params.newItems,
    deletedItems: params.deletedItems,
    passedItems: params.passedItems,
    expectedItems: params.expectedItems,
    actualItems: params.actualItems,
    diffItems: params.diffItems,
    actualDir: '' + params.urlPrefix + path.relative(path.dirname(params.json), params.actualDir),
    expectedDir: '' + params.urlPrefix + path.relative(path.dirname(params.json), params.expectedDir),
    diffDir: '' + params.urlPrefix + path.relative(path.dirname(params.json), params.diffDir)
  };
};

var createHTMLReport = function createHTMLReport(params) {
  var file = path.join(__dirname, '../template/template.html');
  var js = fs.readFileSync(path.join(__dirname, '../report/dist/build.js'));
  var template = fs.readFileSync(file);
  var json = {
    type: params.failedItems.length === 0 ? 'success' : 'danger',
    hasNew: params.newItems.length > 0,
    newItems: params.newItems.map(function (item) {
      return { raw: item, encoded: encodeURIComponent(item) };
    }),
    hasDeleted: params.deletedItems.length > 0,
    deletedItems: params.deletedItems.map(function (item) {
      return { raw: item, encoded: encodeURIComponent(item) };
    }),
    hasPassed: params.passedItems.length > 0,
    passedItems: params.passedItems.map(function (item) {
      return { raw: item, encoded: encodeURIComponent(item) };
    }),
    hasFailed: params.failedItems.length > 0,
    failedItems: params.failedItems.map(function (item) {
      return { raw: item, encoded: encodeURIComponent(item) };
    }),
    actualDir: '' + params.urlPrefix + path.relative(path.dirname(params.report), params.actualDir),
    expectedDir: '' + params.urlPrefix + path.relative(path.dirname(params.report), params.expectedDir),
    diffDir: '' + params.urlPrefix + path.relative(path.dirname(params.report), params.diffDir)
  };
  var faviconType = json.hasFailed || json.hasNew || json.hasDeleted ? 'failure' : 'success';
  var view = {
    js: js,
    report: JSON.stringify(json),
    faviconData: loadFaviconAsDataURL(faviconType)
  };
  return Mustache.render(template.toString(), view);
};

module.exports = function (params) {
  if (params.report) {
    var html = createHTMLReport(params);
    mkdirp.sync(path.dirname(params.report));
    fs.writeFileSync(params.report, html);
  }
  var json = createJSONReport(params);
  mkdirp.sync(path.dirname(params.json));
  fs.writeFileSync(params.json, JSON.stringify(json));
  return json;
};