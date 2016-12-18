const Mustache = require('mustache');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');

module.exports = (params) => {
  const file = path.join(__dirname, '../template/template.html');
  const template = fs.readFileSync(file);

  const passedItemsD = {};

  params.passedItems.forEach(item => {
    const dirName = path.dirname(item);
    const splitedDirName = dirName.split('/');
    if (passedItemsD[dirName]) {
      return passedItemsD[dirName].items.push(item);
    }
    passedItemsD[dirName] = {
      splitedDirName: splitedDirName,
      items: [item],
    };
  });

  console.log(passedItemsD);

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
    actualDir: path.relative(path.dirname(params.reportPath), params.actualDir),
    expectedDir: path.relative(path.dirname(params.reportPath), params.expectedDir),
    diffDir: path.relative(path.dirname(params.reportPath), params.diffDir),
  };
  const output = Mustache.render(template.toString(), view);

  try {
    mkdirp.sync(path.dirname(params.reportPath));
    fs.writeFileSync(params.reportPath, output);
  } catch(err) {
    log.fail(err);
  }
};
