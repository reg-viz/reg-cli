import test from 'ava';
import { execFile } from 'child_process';
import fs from 'fs';
import glob from 'glob';
import copyfiles from 'copyfiles';

const IMAGE_FILES= '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';
const WORKSPACE= './test/__workspace__';
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

test('should genearate image diff and output fail message', async t => {
  await new Promise((resolve) => copyfiles([`${RESORCE}${IMAGE_FILES}`, WORKSPACE], resolve));
  const stdout = await new Promise((resolve) => {
    execFile('./dist/cli.js', [
      `${WORKSPACE}/resource/actual`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`
    ], (error, stdout) => resolve(stdout));
  });

  t.true(stdout.indexOf('test failed.') !== -1);

  try {
    fs.readFileSync(`${WORKSPACE}/diff/sample.jpg`);
    t.pass();
  } catch (e) {
    t.fail();
  }
});

test('should genearate report', async t => {
  await new Promise((resolve) => copyfiles([`${RESORCE}${IMAGE_FILES}`, WORKSPACE], resolve));
  const stdout = await new Promise((resolve) => {
    execFile('./dist/cli.js', [
      `${WORKSPACE}/resource/actual`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`,
      '-R',
      '${WORKSPACE}/report.html'
    ], (error, stdout) => resolve(stdout));
  });

  try {
    fs.readFileSync(`${WORKSPACE}/report.html`);
    t.pass();
  } catch (e) {
    t.fail();
  }
});

test('should update images with -U option', async t => {
  await new Promise((resolve) => copyfiles([`${RESORCE}${IMAGE_FILES}`, WORKSPACE], resolve));
  let stdout = await new Promise((resolve) => {
    execFile('./dist/cli.js', [
      `${WORKSPACE}/resource/actual`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`,
      '-U'
    ], (error, stdout) => resolve(stdout));
  });
  t.true(stdout.indexOf('test failed.') !== -1);
  stdout = await new Promise((resolve) => {
    execFile('./dist/cli.js', [
      `${WORKSPACE}/resource/actual`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`,
      '-U'
    ], (error, stdout) => resolve(stdout));
  });
  t.true(stdout.indexOf('test succeeded.') !== -1);
});

test.after(t => {
  const images = glob.sync(`${WORKSPACE}${IMAGE_FILES}`);
  images.forEach((image) => {
    try {
      fs.unlinkSync(image);
    } catch(err) { }
  })
});
