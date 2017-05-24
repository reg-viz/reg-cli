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
    actualDir: `${params.urlPrefix}${path.relative(path.dirname(params.json), params.actualDir)}`,
    expectedDir: `${params.urlPrefix}${path.relative(path.dirname(params.json), params.expectedDir)}`,
    diffDir: `${params.urlPrefix}${path.relative(path.dirname(params.json), params.diffDir)}`,
  };
};

const createHTMLReport = (params) => {
  const file = path.join(__dirname, '../template/template.html');
  const js = fs.readFileSync(path.join(__dirname, '../report/dist/build.js'));
  const template = fs.readFileSync(file);
  const json = {
    type: params.failedItems.length === 0 ? 'success' : 'danger',
    hasNew: params.newItems.length > 0,
    newItems: params.newItems.map(item => ({ raw: item, encoded: encodeURIComponent(item) })),
    hasDeleted: params.deletedItems.length > 0,
    deletedItems: params.deletedItems.map(item => ({ raw: item, encoded: encodeURIComponent(item) })),
    hasPassed: params.passedItems.length > 0,
    passedItems: params.passedItems.map(item => ({ raw: item, encoded: encodeURIComponent(item) })),
    hasFailed: params.failedItems.length > 0,
    failedItems: params.failedItems.map(item => ({ raw: item, encoded: encodeURIComponent(item) })),
    actualDir: `${params.urlPrefix}${path.relative(path.dirname(params.report), params.actualDir)}`,
    expectedDir: `${params.urlPrefix}${path.relative(path.dirname(params.report), params.expectedDir)}`,
    diffDir: `${params.urlPrefix}${path.relative(path.dirname(params.report), params.diffDir)}`,
  };
  const view = {
    js, report: JSON.stringify(json),
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
