const puppeteer = require('puppeteer');
const mkdirp = require("mkdirp");
const path = require("path");
const root = path.resolve(__dirname, '..');

(async() => {
  const url = `file://${root}/sample/index.html`;
  const outpath = `${root}/screenshot/actual/index.png`;
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  mkdirp.sync(`${root}/screenshot/actual`);
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.content');
  await page.screenshot({ path: outpath });
  browser.close();
  console.log(' \uD83C\uDFA8 Captured screenshot to', outpath);
})();
