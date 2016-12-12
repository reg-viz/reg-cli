import test from 'ava';
import { execFile } from 'child_process';
import fs from 'fs';
import glob from 'glob';
import copyfiles from 'copyfiles';

const IMAGE_FILES= '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';
const TEST_WORKSPACE= './test/__workspace__';
const RESORCE = './resource';

test('should display error message when passing only 1 argument', async t => {
  const stdout = await new Promise((resolve) => {
    execFile('./dist/cli.js', ['./sample/actual'], (error, stdout) => resolve(stdout));
  })
  t.true(stdout.indexOf('please specify actual, expected and diff images directrory') !== -1);
});

test('should display error message when passing only 2 argument', async t => {
  const stdout = await new Promise((resolve) => {
    execFile('./dist/cli.js', ['./sample/actual', './sample/expected'], (error, stdout) => resolve(stdout));
  })
  t.true(stdout.indexOf('please specify actual, expected and diff images directrory') !== -1);
});

test('should genearate image diff', async t => {
  await new Promise((resolve) => copyfiles([`${RESORCE}${IMAGE_FILES}`, TEST_WORKSPACE], resolve));
  const stdout = await new Promise((resolve) => {
    execFile('./dist/cli.js', [
      `./test/__workspace__/resource/actual`,
      `./test/__workspace__/resource/expected`,
      `./test/__workspace__/diff`
    ], (error, stdout) => resolve(stdout));
  });

  try {
    fs.readFileSync(`./test/__workspace__/diff/sample.jpg`);
    t.pass();
  } catch (e) {
    t.fail();
  }
});


test.after(t => {
  const images = glob.sync(`${TEST_WORKSPACE}${IMAGE_FILES}`);
  images.forEach((image) => {
    try {
      fs.unlinkSync(image);
    } catch(err) { }
  })
});
