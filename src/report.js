const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');

module.exports = (params) => {
  const result = JSON.stringify({
    failedItems: params.failedItems,
    newItems: params.newItems,
    deletedItems: params.deletedItems,
    passedItems: params.passedItems,
    actualDir: path.relative(path.dirname(params.dist), params.actualDir),
    expectedDir: path.relative(path.dirname(params.dist), params.expectedDir),
    diffDir: path.relative(path.dirname(params.dist), params.diffDir),
  });

  console.log(result)

  try {
    mkdirp.sync(path.dirname(params.dist));
    fs.writeFileSync(params.dist, result);
  } catch (err) {
    log.fail(err);
  };
}
