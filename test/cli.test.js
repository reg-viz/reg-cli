import test from 'ava';
import fs from 'fs';
import glob from 'glob';
import copyfiles from 'copyfiles';
import rimraf from 'rimraf';
import path from 'path';
import spawn from 'cross-spawn';

const IMAGE_FILES = '/**/*.+(tiff|jpeg|jpg|gif|png|bmp)';
const WORKSPACE = 'test/__workspace__';
const RESOURCE = 'resource';
const SAMPLE_IMAGE = 'sample.jpg';
const SAMPLE_DIFF_IMAGE = 'sample.png';

const resolvePath = (p) => path.resolve(process.cwd(), p);

test.beforeEach(async t => {
  await new Promise((resolve) => copyfiles([`${RESOURCE}${IMAGE_FILES}`, WORKSPACE], resolve));
})

test.serial('should display error message when passing only 1 argument', async t => {
  const stdout = await new Promise((resolve) => {
    const p = spawn(resolvePath('./dist/cli.js'), [resolvePath('./sample/actual')]);
    p.stdout.on('data', data => resolve(data));
    p.stderr.on('data', data => console.error(data));
  });
  t.true(stdout.indexOf('please specify actual, expected and diff images directory') !== -1);
});

test.serial('should display error message when passing only 2 argument', async t => {
  const stdout = await new Promise((resolve) => {
    const p = spawn('./dist/cli.js', ['./sample/actual', './sample/expected']);
    p.stdout.on('data', data => resolve(data));
    p.stderr.on('data', data => console.error(data));
  })
  t.true(stdout.indexOf('please specify actual, expected and diff images directory') !== -1);
});

test.serial('should generate image diff with exit code 1', async t => {
  const code = await new Promise((resolve) => {
    const p = spawn('./dist/cli.js', [
      `${WORKSPACE}/resource/actual`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`,
    ]);
    p.on('close', (code) => resolve(code));
  });
  t.true(code === 1);
  try {
    fs.readFileSync(`${WORKSPACE}/diff/${SAMPLE_DIFF_IMAGE}`);
    t.pass();
  } catch (e) {
    console.log(e)
    t.fail();
  }
});

test.serial('should exit process without error when ignore change option set', async t => {
  const code = await new Promise((resolve) => {
    const p = spawn('./dist/cli.js', [
      `${WORKSPACE}/resource/actual`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`,
      '-I'
    ]);
    p.on('close', (code) => resolve(code));
    p.stderr.on('data', data => console.error(data));
    p.on('error', (e) => {
      t.fail();
      console.error(e);
    });
  });
  t.true(code === 0);
});


test.serial('should generate report json to `./reg.json` when not specified dist path', async t => {
  await new Promise((resolve) => {
    const p = spawn('./dist/cli.js', [
      `${WORKSPACE}/resource/actual`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`,
    ]);
    p.on('close', (code) => resolve(code));
    p.stderr.on('data', data => console.error(data));
  });
  try {
    fs.readFileSync(`./reg.json`);
    t.pass();
  } catch (e) {
    t.fail();
  }
});

test.serial('should generate report json to `${WORKSPACE}/dist/reg.json` when dist path specified', async t => {
  await new Promise((resolve) => {
    const p = spawn('./dist/cli.js', [
      `${WORKSPACE}/resource/actual`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`,
      `-J`,
      `${WORKSPACE}/dist/reg.json`,
    ]);
    p.on('close', (code) => resolve(code));
    p.stderr.on('data', data => console.error(data));
  });

  try {
    fs.readFileSync(`${WORKSPACE}/dist/reg.json`);
    t.pass();
  } catch (e) {
    t.fail();
  }
});

test.serial('should generate report html to `${WORKSPACE}/dist/report.html` when `-R` option enabled', async t => {
  await new Promise((resolve) => {
    const p = spawn('./dist/cli.js', [
      `${WORKSPACE}/resource/actual`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`,
      `-R`,
      `${WORKSPACE}/dist/report.html`,
    ]);
    p.on('close', (code) => resolve(code));
    p.stderr.on('data', data => console.error(data));
  });

  try {
    fs.readFileSync(`${WORKSPACE}/dist/report.html`);
    t.pass();
  } catch (e) {
    console.error(e);
    t.fail();
  }
});

test.serial('should generate fail report', async t => {
  await new Promise((resolve) => {
    const p = spawn('./dist/cli.js', [
      `${WORKSPACE}/resource/actual`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`,
    ]);
    p.on('close', (code) => resolve(code));
    p.stderr.on('data', data => console.error(data));
  });

  try {
    const report = JSON.parse(fs.readFileSync(`./reg.json`, 'utf8'));
    const expected = {
      actualItems: [`/${SAMPLE_IMAGE}`],
      expectedItems: [`/${SAMPLE_IMAGE}`],
      diffItems: [`/${SAMPLE_DIFF_IMAGE}`],
      failedItems: [`/${SAMPLE_IMAGE}`],
      newItems: [],
      deletedItems: [],
      passedItems: [],
      actualDir: `./${WORKSPACE}/resource/actual`,
      expectedDir: `./${WORKSPACE}/resource/expected`,
      diffDir: `./${WORKSPACE}/diff`,
    };
    t.deepEqual(report, expected);
  } catch (e) {
    t.fail();
  }
});

test.serial('should update images with `-U` option', async t => {
  let code = await new Promise((resolve) => {
    const p = spawn('./dist/cli.js', [
      `${WORKSPACE}/resource/actual`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`,
      '-U'
    ]);
    p.on('close', (code) => resolve(code));
    p.stderr.on('data', data => console.error(data));
  });
  t.true(code === 0);
});

test.serial('should generate success report', async t => {
  const stdout = await new Promise((resolve) => {
    const p = spawn('./dist/cli.js', [
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/resource/expected`,
      `${WORKSPACE}/diff`,
    ]);
    p.stdout.on('data', data => resolve(data));
    p.stderr.on('data', data => console.error(data));
  });

  try {
    const report = JSON.parse(fs.readFileSync(`./reg.json`, 'utf8'));
    const expected = {
      actualItems: [`/${SAMPLE_IMAGE}`],
      expectedItems: [`/${SAMPLE_IMAGE}`],
      diffItems: [],
      failedItems: [],
      newItems: [],
      deletedItems: [],
      passedItems: [`/${SAMPLE_IMAGE}`],
      actualDir: `./${WORKSPACE}/resource/expected`,
      expectedDir: `./${WORKSPACE}/resource/expected`,
      diffDir: `./${WORKSPACE}/diff`,
    };
    t.deepEqual(report, expected);
  } catch (e) {
    t.fail();
  }
});

test.serial('should generate newItem report', async t => {
  const stdout = await new Promise(async (resolve) => {
    rimraf(`${WORKSPACE}/resource/expected`, () => {
      const p = spawn('./dist/cli.js', [
        `${WORKSPACE}/resource/actual`,
        `${WORKSPACE}/resource/expected`,
        `${WORKSPACE}/diff`,
      ]);
      p.on('close', (code) => resolve(code));
      p.stderr.on('data', data => console.error(data));
    });
  });

  try {
    const report = JSON.parse(fs.readFileSync(`./reg.json`, 'utf8'));
    const expected = {
      actualItems: [`/${SAMPLE_IMAGE}`],
      expectedItems: [],
      diffItems: [],
      failedItems: [],
      newItems: [`/${SAMPLE_IMAGE}`],
      deletedItems: [],
      passedItems: [],
      actualDir: `./${WORKSPACE}/resource/actual`,
      expectedDir: `./${WORKSPACE}/resource/expected`,
      diffDir: `./${WORKSPACE}/diff`,
    };
    t.deepEqual(report, expected);
  } catch (e) {
    t.fail();
  }
});

test.serial('should generate deletedItem report', async t => {
  const stdout = await new Promise(async (resolve) => {
    rimraf(`${WORKSPACE}/resource/actual`, () => {
      const p = spawn('./dist/cli.js', [
        `${WORKSPACE}/resource/actual`,
        `${WORKSPACE}/resource/expected`,
        `${WORKSPACE}/diff`,
      ]);
      p.on('close', (code) => resolve(code));
      p.stderr.on('data', data => console.error(data));
    });
  });

  try {
    const report = JSON.parse(fs.readFileSync(`./reg.json`, 'utf8'));
    const expected = {
      actualItems: [],
      expectedItems: [`/${SAMPLE_IMAGE}`],
      diffItems: [],
      failedItems: [],
      newItems: [],
      deletedItems: [`/${SAMPLE_IMAGE}`],
      passedItems: [],
      actualDir: `./${WORKSPACE}/resource/actual`,
      expectedDir: `./${WORKSPACE}/resource/expected`,
      diffDir: `./${WORKSPACE}/diff`,
    };
    t.deepEqual(report, expected);
  } catch (e) {
    t.fail();
  }
});

test.afterEach.always(async t => {
  await new Promise((done) => rimraf(`${WORKSPACE}${IMAGE_FILES}`, done));
  await new Promise((done) => rimraf(`./reg.json`, done));
});

