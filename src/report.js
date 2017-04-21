const Mustache = require('mustache');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const log = require('./log');

const createJSONReport = (params) => {
  return {
    failedItems: params.failedItems,
    newItems: params.newItems,
    deletedItems: params.deletedItems,
    passedItems: params.passedItems,
    expectedItems: params.expectedItems,
    actualItems: params.actualItems,
    diffItems: params.diffItems,
    actualDir: `./${path.relative(path.dirname(params.json), params.actualDir)}`,
    expectedDir: `./${path.relative(path.dirname(params.json), params.expectedDir)}`,
    diffDir: `./${path.relative(path.dirname(params.json), params.diffDir)}`,
  };
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
    actualDir: `./${path.relative(path.dirname(params.report), params.actualDir)}`,
    expectedDir: `./${path.relative(path.dirname(params.report), params.expectedDir)}`,
    diffDir: `./${path.relative(path.dirname(params.report), params.diffDir)}`,
  };
  return Mustache.render(template.toString(), view);
};

module.exports = (params) => {
  if (params.report) {
    const html = createHTMLReport(params);
    try {
      mkdirp.sync(path.dirname(params.report));
      fs.writeFileSync(params.report, html);
    } catch (err) {
      log.fail(err);
    };
  }
  const json = createJSONReport(params);
  try {
    mkdirp.sync(path.dirname(params.json));
    fs.writeFileSync(params.json, JSON.stringify(json));
  } catch (err) {
    log.fail(err);
  };
  return json;
}
