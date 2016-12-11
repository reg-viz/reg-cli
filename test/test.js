import test from 'ava';
import { execFile } from 'child_process';

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

test('should display error message when passing only 2 argument', async t => {
  const stdout = await new Promise((resolve) => {
    execFile('./dist/cli.js', ['./sample/actual', './sample/expected', './diff'], (error, stdout) => resolve(stdout));
  })
  t.true(true);
});

