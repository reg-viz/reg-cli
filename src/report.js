const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');

module.exports = (params) => {
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
}
