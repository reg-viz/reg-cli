const puppeteer = require('puppeteer');
const path = require('path');

const DEVICE_PROFILE = {
  viewport: {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    isLandscape: false,
  },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.101 Safari/537.36',
};
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.emulate(DEVICE_PROFILE);
  await page.goto(`file://${root}/sample/index.html`);
  await page.screenshot({ path: `${root}/screenshot/actual/index.png`, fullPage: true });
  await browser.close();
})();
