#!/usr/bin/env node

/* @flow */


const meow = require('meow');
const compare = require('./');
const log = require('./log');

const IMAGE_FILES= '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';

if (!process.argv[2] || !process.argv[3] || !process.argv[4]) {
  log.fail('please specify actual, expected and diff images directrory.');
  log.fail('e.g.: $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir');
  process.exit(1);
}

const cli = meow(`
  Usage
    $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir
  Options
    -U, --update Update expected images.(Copy \`actual images\` to \`expected images\`).
    -R, --report Output html report to specfied directory.
  Examples
    $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir -U -R ./report.html
`, {
  alias: {
    U: 'update',
    R: 'report',
  },
});

const reportPath = cli.flags.report === true
        ? './report.html' // default putput path
        : cli.flags.report

compare({
  actualDir: process.argv[2],
  expectedDir: process.argv[3],
  diffDir: process.argv[4],
  update: !!cli.flags.update,
  reportPath,
});
