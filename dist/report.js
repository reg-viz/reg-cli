'use strict';

var Mustache = require('mustache');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var log = require('./log');

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
  var template = fs.readFileSync(file);
  var view = {
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
  return Mustache.render(template.toString(), view);
};

module.exports = function (params) {
  if (params.report) {
    var html = createHTMLReport(params);
    try {
      mkdirp.sync(path.dirname(params.report));
      fs.writeFileSync(params.report, html);
    } catch (err) {
      log.fail(err);
    };
  }
  var json = createJSONReport(params);
  try {
    mkdirp.sync(path.dirname(params.json));
    fs.writeFileSync(params.json, JSON.stringify(json));
  } catch (err) {
    log.fail(err);
  };
  return json;
};