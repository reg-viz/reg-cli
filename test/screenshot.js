const Nightmare = require("nightmare");
const nightmare = Nightmare({
  show: false, width: 1200, height: 2600, webPreferences: {
    nodeIntegration: true,
  }
});
const mkdirp = require("mkdirp");
const path = require("path");
const root = path.resolve(__dirname, '..');

mkdirp.sync(`${root}/screenshot/actual`);

nightmare
  .viewport(1200, 2400)
  .goto(`file://${root}/sample/index.html`)
  .wait(5000)
  .screenshot(`${root}/screenshot/actual/index.png`)
  .end()
  .then(() => {
    console.log("Captured screenshot")
  })
  .catch(x => {
    console.error(x);
    process.exit(1);
  });
