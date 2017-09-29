#!/usr/bin/env node

/* @flow */

import { Spinner } from 'cli-spinner';
import meow from 'meow';
import compare from './';
import log from './log';
// import notifier from './notifier';
import { BALLOT_X, CHECK_MARK, TEARDROP, MULTIPLICATION_X, GREEK_CROSS, MINUS } from './icon';

const IMAGE_FILES = '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

const spinner = new Spinner();
spinner.setSpinnerString(18);

if (!process.argv[2] || !process.argv[3] || !process.argv[4]) {
  log.fail('please specify actual, expected and diff images directory.');
  log.fail('e.g.: $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir');
  process.exit(1);
}

const cli = meow(`
  Usage
    $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir
  Options
    -U, --update Update expected images.(Copy \`actual images\` to \`expected images\`).
    -J, --json Specified json report path. If omitted ./reg.json.
    -I, --ignoreChange If true, process.exit(0) called if changed items detected.
    -R, --report Output html report to specified directory.
    -P, --urlPrefix Add prefix to all image src.
    -T, --threshold Threshold for detecting change. Value can range from 0.00 (no difference) to 1.00 (every pixel is different).
    -C, --concurrency How many processes launches in parallel. If omitted 4.
    -A, --enableAntialias. Enable antialias. If omitted false.
  Examples
    $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir -U -D ./reg.json
`, {
    alias: {
      U: 'update',
      J: 'json',
      I: 'ignoreChange',
      R: 'report',
      P: 'urlPrefix',
      T: 'threshold',
      C: 'concurrency',
      A: 'enableAntialias',
    },
  });

const json = cli.flags.json
  ? cli.flags.json.toString()
  : './reg.json'; // default output path

const urlPrefix = typeof cli.flags.urlPrefix === 'string'
  ? cli.flags.urlPrefix
  : './';

const report = typeof cli.flags.report === 'string'
  ? cli.flags.report
  : !!cli.flags.report ? './report.html' : '';

const threshold = Number(cli.flags.threshold) || 0;

const actualDir = process.argv[2];
const expectedDir = process.argv[3];
const diffDir = process.argv[4];
const update = !!cli.flags.update;
const ignoreChange = !!cli.flags.ignoreChange;

const observer = compare({
  actualDir,
  expectedDir,
  diffDir,
  update,
  report,
  json,
  urlPrefix,
  threshold,
  concurrency: Number(cli.flags.concurrency) || 4,
  enableAntialias: !!cli.flags.enableAntialias,
});

observer.once('start', () => spinner.start());

observer.on('compare', ({ type, path }) => {
  spinner.stop(true);
  switch (type) {
    case 'delete': return log.warn(`${MINUS} delete  ${actualDir}${path}`);
    case 'new': return log.info(`${GREEK_CROSS} append  ${actualDir}${path}`);
    case 'pass': return log.success(`${CHECK_MARK} pass    ${actualDir}${path}`);
    case 'fail': return log.fail(`${BALLOT_X} change  ${actualDir}${path}`);
  }
  spinner.start();
})

observer.once('complete', (result) => {
  spinner.stop(true);
  log.info('\n');
  if (result.failedItems.length) log.fail(`${BALLOT_X} ${result.failedItems.length} file(s) changed.`);
  if (result.deletedItems.length) log.warn(`${MINUS} ${result.deletedItems.length} file(s) deleted.`);
  if (result.newItems.length) log.info(`${GREEK_CROSS} ${result.newItems.length} file(s) appended.`);
  if (result.passedItems.length) log.success(`${CHECK_MARK} ${result.passedItems.length} file(s) passed.`);
  if (!update && result.failedItems.length > 0) {
    log.fail(`\nInspect your code changes, re-run with \`-U\` to update them. `);
    if (!ignoreChange) process.exit(1);
  }
  return process.exit(0);
})

observer.once('error', (error) => {
  log.fail(error);
  process.exit(1);
})

