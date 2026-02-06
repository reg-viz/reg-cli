#!/usr/bin/env node

/* @flow */

import { Spinner } from 'cli-spinner';
import meow from 'meow';
import path from 'path';
import compare from './';
import log from './log';
import fs from 'fs';

// import notifier from './notifier';
import { BALLOT_X, CHECK_MARK, GREEK_CROSS, MINUS } from './icon';
import createReport from './report';
import { initTracing, shutdownTracing, startRootSpan, endRootSpan, isTracingEnabled } from './tracing';

const spinner = new Spinner();
spinner.setSpinnerString(18);

const cli = meow(
  `
  Usage
    $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir
  Options
    -U, --update Update expected images.(Copy \`actual images\` to \`expected images\`).
    -J, --json Specified json report path. If omitted ./reg.json.
    -I, --ignoreChange If true, error will not be thrown when image change detected.
    -E, --extendedErrors If true, also added/deleted images will throw an error. If omitted false.
    -R, --report Output html report to specified directory.
    --junit Output junit report to specified file.
    -P, --urlPrefix Add prefix to all image src.
    -M, --matchingThreshold Matching threshold, ranges from 0 to 1. Smaller values make the comparison more sensitive. 0 by default.
    -T, --thresholdRate Rate threshold for detecting change. When the difference ratio of the image is larger than the set rate detects the change.
    -S, --thresholdPixel Pixel threshold for detecting change. When the difference pixel of the image is larger than the set pixel detects the change. This value takes precedence over \`thresholdRate\`.
    -C, --concurrency How many processes launches in parallel. If omitted 4.
    -A, --enableAntialias. Enable antialias. If omitted false.
    -X, --additionalDetection. Enable additional difference detection(highly experimental). Select "none" or "client" (default: "none").
    -F, --from Generate report from json. Please specify json file. If set, only report will be output without comparing images.
    -D, --customDiffMessage Pass custom massage that will logged to the terminal when there is a diff.
  Examples
    $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir -U -D ./reg.json
`,
  {
    flags: {
      update: {
        type: 'boolean',
        alias: 'U',
      },
      json: {
        type: 'string',
        alias: 'J',
        default: './reg.json',
      },
      ignoreChange: {
        type: 'boolean',
        alias: 'I',
      },
      extendedErrors: {
        type: 'boolean',
        alias: 'E',
        default: false,
      },
      report: {
        type: 'string',
        alias: 'R',
      },
      junit: {
        type: 'string',
      },
      urlPrefix: {
        type: 'string',
        alias: 'P',
      },
      matchingThreshold: {
        type: 'number',
        alias: 'M',
        default: 0,
      },
      thresholdRate: {
        type: 'number',
        alias: 'T',
      },
      thresholdPixel: {
        type: 'number',
        alias: 'S',
      },
      concurrency: {
        type: 'number',
        alias: 'C',
        default: 4,
      },
      enableAntialias: {
        type: 'boolean',
        alias: 'A',
        default: false,
      },
      additionalDetection: {
        type: 'string',
        alias: 'X',
        default: 'none',
      },
      from: {
        type: 'string',
        alias: 'F',
      },
      customDiffMessage: {
        type: 'string',
        alias: 'D',
      },
    },
  },
);
if (!cli.flags.from) {
  if (!process.argv[2] || !process.argv[3] || !process.argv[4]) {
    log.fail('please specify actual, expected and diff images directory.');
    log.fail('e.g.: $ reg-cli /path/to/actual-dir /path/to/expected-dir /path/to/diff-dir');
    process.exit(1);
  }
}

const json = cli.flags.json ? cli.flags.json.toString() : './reg.json'; // default output path

const urlPrefix = typeof cli.flags.urlPrefix === 'string' ? cli.flags.urlPrefix : './';

const report = typeof cli.flags.report === 'string' ? cli.flags.report : !!cli.flags.report ? './report.html' : '';
const junitReport = typeof cli.flags.junit === 'string' ? cli.flags.junit : !!cli.flags.junit ? './junit.xml' : '';
const actualDir = process.argv[2];
const expectedDir = process.argv[3];
const diffDir = process.argv[4];
const update = !!cli.flags.update;
const extendedErrors = !!cli.flags.extendedErrors;
const ignoreChange = !!cli.flags.ignoreChange;
const enableClientAdditionalDetection = cli.flags.additionalDetection === 'client';
const from = String(cli.flags.from || '');
const customDiffMessage = String(
  cli.flags.customDiffMessage || `\nInspect your code changes, re-run with \`-U\` to update them. `,
);

// If from option specified, generate report from json and exit.
if (from) {
  let json = '';
  try {
    json = fs.readFileSync(from, { encoding: 'utf8' });
  } catch (e) {
    log.fail('Failed to read specify json.');
    log.fail(e);
    process.exit(1);
  }

  try {
    const params = JSON.parse(json);
    createReport({
      ...params,
      json: json || './reg.json',
      report: report || './report.html',
      junitReport: junitReport || '',
      extendedErrors,
      urlPrefix: urlPrefix || '',
      enableClientAdditionalDetection,
      fromJSON: true,
    });
    process.exit(0);
  } catch (e) {
    log.fail('Failed to parse json. Please specify valid json.');
    log.fail(e);
    process.exit(1);
  }
}

// Initialize tracing if enabled
if (isTracingEnabled()) {
  initTracing();
  startRootSpan('reg-cli-js');
}

const observer = compare({
  actualDir,
  expectedDir,
  diffDir,
  update,
  report,
  junitReport,
  extendedErrors,
  json,
  urlPrefix,
  matchingThreshold: Number(cli.flags.matchingThreshold || 0),
  thresholdRate: Number(cli.flags.thresholdRate),
  thresholdPixel: Number(cli.flags.thresholdPixel),
  concurrency: Number(cli.flags.concurrency || 4),
  enableAntialias: !!cli.flags.enableAntialias,
  enableClientAdditionalDetection,
});

observer.once('start', () => spinner.start());

observer.on('compare', params => {
  spinner.stop(true);
  const file = path.join(`${actualDir}`, `${params.path}`);
  switch (params.type) {
    case 'delete':
      return log.warn(`${MINUS} delete  ${file}`);
    case 'new':
      return log.info(`${GREEK_CROSS} append  ${file}`);
    case 'pass':
      return log.success(`${CHECK_MARK} pass    ${file}`);
    case 'fail':
      return log.fail(`${BALLOT_X} change  ${file}`);
  }
  spinner.start();
});

observer.once('update', () => log.success(`✨ your expected images are updated ✨`));

observer.once('complete', async ({ failedItems, deletedItems, newItems, passedItems }) => {
  spinner.stop(true);
  log.info('\n');
  if (failedItems.length) log.fail(`${BALLOT_X} ${failedItems.length} file(s) changed.`);
  if (deletedItems.length) log.warn(`${MINUS} ${deletedItems.length} file(s) deleted.`);
  if (newItems.length) log.info(`${GREEK_CROSS} ${newItems.length} file(s) appended.`);
  if (passedItems.length) log.success(`${CHECK_MARK} ${passedItems.length} file(s) passed.`);
  
  // End tracing
  if (isTracingEnabled()) {
    endRootSpan(true);
    await shutdownTracing();
  }
  
  if (!update && (failedItems.length > 0 || (extendedErrors && (newItems.length > 0 || deletedItems.length > 0)))) {
    log.fail(customDiffMessage);
    if (!ignoreChange) process.exit(1);
  }
  return process.exit(0);
});

observer.once('error', async error => {
  // End tracing with error
  if (isTracingEnabled()) {
    endRootSpan(false);
    await shutdownTracing();
  }
  
  log.fail(error);
  process.exit(1);
});
