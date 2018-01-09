/* @flow */

// $FlowIgnore
import Mustache from 'mustache';
import * as detectDiff from 'x-img-diff-js';
import fs from 'fs';
import mkdirp from 'mkdirp';
import path from 'path';
import log from './log';

export type ReportParams = {
  passedItems: string[];
  failedItems: string[];
  newItems: string[];
  deletedItems: string[];
  expectedItems: string[];
  previousExpectedImages: string[];
  actualItems: string[];
  diffItems: string[];
  json: string;
  actualDir: string;
  expectedDir: string;
  diffDir: string;
  report: string;
  urlPrefix: string;
  enableClientAdditionalDetection: boolean;
}

const loadFaviconAsDataURL = (type) => {
  const fname = path.resolve(__dirname, `../report/assets/favicon_${type}.png`);
  const buffer = fs.readFileSync(fname);
  return 'data:image/png;base64,' + buffer.toString('base64');
}

const createJSONReport = (params) => {
  return {
    failedItems: params.failedItems,
    newItems: params.newItems,
    deletedItems: params.deletedItems,
    passedItems: params.passedItems,
    expectedItems: params.expectedItems,
    actualItems: params.actualItems,
    diffItems: params.diffItems,
    actualDir: `${params.urlPrefix}${path.relative(path.dirname(params.json), params.actualDir)}`,
    expectedDir: `${params.urlPrefix}${path.relative(path.dirname(params.json), params.expectedDir)}`,
    diffDir: `${params.urlPrefix}${path.relative(path.dirname(params.json), params.diffDir)}`,
  };
};

const createHTMLReport = (params) => {
  const file = path.join(__dirname, '../template/template.html');
  const js = fs.readFileSync(path.join(__dirname, '../report/dist/build.js'));
  const template = fs.readFileSync(file);
  const json = {
    type: params.failedItems.length === 0 ? 'success' : 'danger',
    hasNew: params.newItems.length > 0,
    newItems: params.newItems.map(item => ({ raw: item, encoded: encodeURIComponent(item) })),
    hasDeleted: params.deletedItems.length > 0,
    deletedItems: params.deletedItems.map(item => ({ raw: item, encoded: encodeURIComponent(item) })),
    hasPassed: params.passedItems.length > 0,
    passedItems: params.passedItems.map(item => ({ raw: item, encoded: encodeURIComponent(item) })),
    hasFailed: params.failedItems.length > 0,
    failedItems: params.failedItems.map(item => ({ raw: item, encoded: encodeURIComponent(item) })),
    actualDir: `${params.urlPrefix}${path.relative(path.dirname(params.report), params.actualDir)}`,
    expectedDir: `${params.urlPrefix}${path.relative(path.dirname(params.report), params.expectedDir)}`,
    diffDir: `${params.urlPrefix}${path.relative(path.dirname(params.report), params.diffDir)}`,
    ximgdiffConfig: {
      enabled: params.enableClientAdditionalDetection,
      workerUrl: `${params.urlPrefix}worker.js`,
    },
  };
  const faviconType = (json.hasFailed || json.hasNew || json.hasDeleted) ? 'failure' : 'success';
  const view = {
    js,
    report: JSON.stringify(json),
    faviconData: loadFaviconAsDataURL(faviconType),
  };
  return Mustache.render(template.toString(), view);
};

function createXimdiffWorker(params: ReportParams) {
  const file = path.join(__dirname, '../template/worker_pre.js');
  const moduleJs = fs.readFileSync(path.join(__dirname, '../report/dist/worker.js'), 'utf8');
  const wasmLoaderJs = fs.readFileSync(detectDiff.getBrowserJsPath(), 'utf8');
  const template = fs.readFileSync(file);
  const ximgdiffWasmUrl = `${params.urlPrefix}detector.wasm`;
  return Mustache.render(template.toString(), { ximgdiffWasmUrl }) + '\n' + moduleJs + '\n' + wasmLoaderJs;
}

export default (params: ReportParams) => {
  if (!!params.report) {
    const html = createHTMLReport(params);
    mkdirp.sync(path.dirname(params.report));
    fs.writeFileSync(params.report, html);
    if (!!params.enableClientAdditionalDetection) {
      const workerjs = createXimdiffWorker(params);
      fs.writeFileSync(path.resolve(path.dirname(params.report), 'worker.js'), workerjs);
      const wasmBuf = fs.readFileSync(detectDiff.getBrowserWasmPath());
      fs.writeFileSync(path.resolve(path.dirname(params.report), 'detector.wasm'), wasmBuf);
    }
  }
  const json = createJSONReport(params);
  mkdirp.sync(path.dirname(params.json));
  fs.writeFileSync(params.json, JSON.stringify(json));
  return json;
}
