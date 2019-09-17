const path = require('path');
const finalhandler = require('finalhandler');
const http = require('http');
const serveStatic = require('serve-static');

const root = path.resolve(__dirname, '..');
const serve = serveStatic(`${root}/resource`, { index: ['report.html'] });

const server = http.createServer((req, res) => {
  serve(req, res, finalhandler(req, res));
});

server.listen(3000);

const mkdirp = require('mkdirp');

const puppeteer = require('puppeteer');

mkdirp.sync(`${root}/screenshot/actual`);

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: 1200,
    height: 800,
  });

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });

  await page.screenshot({
    path: `${root}/screenshot/actual/index.png`,
  });

  await page.close();
  process.exit(0);
})();
