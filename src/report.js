const Mustache = require('mustache');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const log = require('./log');

const createJSONReport = (params) => {
  const result = {
    failedItems: params.failedItems,
    newItems: params.newItems,
    deletedItems: params.deletedItems,
    passedItems: params.passedItems,
    expectedItems: params.expectedItems,
    actualItems: params.actualItems,
    diffItems: params.diffItems,
    actualDir: path.relative(path.dirname(params.dist), params.actualDir),
    expectedDir: path.relative(path.dirname(params.dist), params.expectedDir),
    diffDir: path.relative(path.dirname(params.dist), params.diffDir),
  };
  try {
    mkdirp.sync(path.dirname(params.dist));
    fs.writeFileSync(params.dist, JSON.stringify(result));
  } catch (err) {
    log.fail(err);
  };
  return result;
};

const createHTMLReport = (params) => {
  const file = path.join(__dirname, '../template/template.html');
  const template = fs.readFileSync(file);
  const view = {
    type: params.failedItems.length === 0 ? 'success' : 'danger',
    hasNew: params.newItems.length > 0,
    newItems: params.newItems,
    hasDeleted: params.deletedItems.length > 0,
    deletedItems: params.deletedItems,
    hasPassed: params.passedItems.length > 0,
    passedItems: params.passedItems,
    hasFailed: params.failedItems.length > 0,
    failedItems: params.failedItems,
    actualDir: path.relative(path.dirname(params.report), params.actualDir),
    expectedDir: path.relative(path.dirname(params.report), params.expectedDir),
    diffDir: path.relative(path.dirname(params.report), params.diffDir),
  };
  const output = Mustache.render(template.toString(), view);
  try {
    mkdirp.sync(path.dirname(params.dist));
    fs.writeFileSync(params.report, output);
  } catch (err) {
    log.fail(err);
  };
};

module.exports = (params) => {
  if (params.report) {
    createHTMLReport(params);
  }
  const report = createJSONReport(params);
  return report;
}
