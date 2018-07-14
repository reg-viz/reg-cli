#!/usr/bin/env node

/* @flow */

import { Spinner } from 'cli-spinner';
import meow from 'meow';
import path from 'path';
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
    -I, --ignoreChange If true, error will not be thrown when image change detected.
    -R, --report Output html report to specified directory.
    -P, --urlPrefix Add prefix to all image src.
    -T, --thresholdRate Rate threshold for detecting change. When the difference ratio of the image is larger than the set rate detects the change.
    -S, --thresholdPixel Pixel threshold for detecting change. When the difference pixel of the image is larger than the set pixel detects the change. This value takes precedence over \`thresholdRate\`.
    -C, --concurrency How many processes launches in parallel. If omitted 4.
    -A, --enableAntialias. Enable antialias. If omitted false.
    -X, --additionalDetection. Enable additional difference detection(highly experimental). Select "none" or "client" (default: "none").
  Examples
    $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir -U -D ./reg.json
`, {
    alias: {
      U: 'update',
      J: 'json',
      I: 'ignoreChange',
      R: 'report',
      P: 'urlPrefix',
      T: 'thresholdRate',
      S: 'thresholdPixel',
      C: 'concurrency',
      A: 'enableAntialias',
      X: 'additionalDetection',
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
  thresholdRate: Number(cli.flags.thresholdRate),
  thresholdPixel: Number(cli.flags.thresholdPixel),
  concurrency: Number(cli.flags.concurrency) || 4,
  enableAntialias: !!cli.flags.enableAntialias,
  enableClientAdditionalDetection: cli.flags.additionalDetection === 'client',
});

observer.once('start', () => spinner.start());

observer.on('compare', (params) => {
  spinner.stop(true);
  const file = path.join(`${actualDir}`, `${params.path}`);
  switch (params.type) {
    case 'delete': return log.warn(`${MINUS} delete  ${file}`);
    case 'new': return log.info(`${GREEK_CROSS} append  ${file}`);
    case 'pass': return log.success(`${CHECK_MARK} pass    ${file}`);
    case 'fail': return log.fail(`${BALLOT_X} change  ${file}`);
  }
  spinner.start();
});

observer.once('update', () => log.success(`✨ your expected images are updated ✨`));

observer.once('complete', ({ failedItems, deletedItems, newItems, passedItems }) => {
  spinner.stop(true);
  log.info('\n');
  if (failedItems.length) log.fail(`${BALLOT_X} ${failedItems.length} file(s) changed.`);
  if (deletedItems.length) log.warn(`${MINUS} ${deletedItems.length} file(s) deleted.`);
  if (newItems.length) log.info(`${GREEK_CROSS} ${newItems.length} file(s) appended.`);
  if (passedItems.length) log.success(`${CHECK_MARK} ${passedItems.length} file(s) passed.`);
  if (!update && failedItems.length > 0) {
    log.fail(`\nInspect your code changes, re-run with \`-U\` to update them. `);
    if (!ignoreChange) process.exit(1);
  }
  return process.exit(0);
});

observer.once('error', (error) => {
  log.fail(error);
  process.exit(1);
});

