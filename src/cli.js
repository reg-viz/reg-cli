#!/usr/bin/env node

/* @flow */

const meow = require('meow');
const compare = require('./');
const log = require('./log');

const IMAGE_FILES = '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

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
    -I, --ignoreChange If true, error will not be thrown when image change detected.
    -R, --report Output html report to specified directory.
    -P, --urlPrefix Add prefix to all image src.
    -T, --threshold Threshold for detecting change. Value can range from 0.00 (no difference) to 1.00 (every pixel is different).
    -C, --concurrency How many processes launches in parallel. If omitted 4.
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
    },
  });

const json = cli.flags.json ? cli.flags.json.toString() : './reg.json'; // default output path

const urlPrefix = typeof cli.flags.urlPrefix === 'string' ? cli.flags.urlPrefix : './';

const report = typeof cli.flags.report === 'string'
  ? cli.flags.report
  : !!cli.flags.report && './report.html';

const threshold = Number(cli.flags.threshold) || 0;

compare({
  actualDir: process.argv[2],
  expectedDir: process.argv[3],
  diffDir: process.argv[4],
  update: !!cli.flags.update,
  ignoreChange: !!cli.flags.ignoreChange,
  report,
  json,
  urlPrefix,
  threshold,
  concurrency: cli.flags.concurrency || 4,
})
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
