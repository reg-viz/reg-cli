import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, cp, rm, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(repo, 'dist/cli.mjs');
const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'reg-cli-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const temp = join(root, 'temporary output');
  await mkdir(temp);
  // Mock the package boundary so tests never open a browser on the host.
  const register = new URL('./fixtures/register-open-mock.mjs', import.meta.url).href;
  const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${register}`,
    TMPDIR: temp, TEMP: temp, TMP: temp,
    OPEN_LOG: join(root, 'opened'),
  };
  return { root, temp, env };
}

function launch(t, command, args, options) {
  const child = spawn(command, args, options);
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const closed = once(child, 'close');
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', () => {
      if (stdout.includes('Press Enter')) resolve();
    });
    child.once('close', () => reject(new Error(`Exited before wait: ${stdout}\n${stderr}`)));
    child.once('error', reject);
  });
  // Some cases intentionally fail before the prompt.
  ready.catch(() => {});
  return { child, closed, ready, output: () => ({ stdout, stderr }) };
}

const sampleArgs = [join(repo, 'sample/actual'), join(repo, 'sample/expected')];

for (const finish of ['enter', 'SIGINT', 'SIGTERM', 'SIGHUP', 'eof']) {
  test(`--open --wait keeps output alive and cleans up on ${finish}`, {
    timeout: 20000,
    // Windows child.kill() terminates without running signal handlers.
    skip: process.platform === 'win32' && finish.startsWith('SIG'),
  }, async (t) => {
    const f = await fixture(t);
    const p = launch(t, process.execPath, [cli, ...sampleArgs, '--open', '--wait'], { cwd: f.root, env: f.env });
    await p.ready;
    const report = fileURLToPath(await readFile(f.env.OPEN_LOG, 'utf8'));
    const output = dirname(report);
    await stat(report);
    await stat(join(output, 'diff/sample0.png'));
    const json = JSON.parse(await readFile(join(output, 'reg.json'), 'utf8'));
    assert.deepEqual(json.failedItems, ['sample0.png']);
    assert.equal(p.child.exitCode, null);
    if (finish === 'enter') p.child.stdin.write('\n');
    else if (finish === 'eof') p.child.stdin.end();
    else p.child.kill(finish);
    const [code] = await p.closed;
    assert.equal(code, { enter: 1, eof: 1, SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[finish]);
    assert.deepEqual(await readdir(f.temp), []);
    await assert.rejects(stat(join(f.root, 'reg.json')));
  });
}

test('explicit output survives Enter and --ignoreChange preserves success', { timeout: 20000 }, async (t) => {
  const f = await fixture(t);
  const p = launch(t, process.execPath, [cli, ...sampleArgs, 'diff', '-R', 'report.html', '-J', 'reg.json', '--open', '--wait', '-I'], { cwd: f.root, env: f.env });
  await p.ready;
  p.child.stdin.write('\n');
  assert.equal((await p.closed)[0], 0);
  await stat(join(f.root, 'diff/sample0.png'));
  await stat(join(f.root, 'report.html'));
  await stat(join(f.root, 'reg.json'));
  assert.deepEqual(await readdir(f.temp), []);
});

test('browser launch failure removes temporary output', { timeout: 20000 }, async (t) => {
  const f = await fixture(t);
  const p = launch(t, process.execPath, [cli, ...sampleArgs, '--open', '--wait', '-I'], { cwd: f.root, env: { ...f.env, OPEN_ERROR: 'browser launch failed' } });
  assert.equal((await p.closed)[0], 1);
  assert.match(p.output().stderr, /browser launch failed/);
  assert.deepEqual(await readdir(f.temp), []);
});

test('comparison error removes temporary output', { timeout: 20000 }, async (t) => {
  const f = await fixture(t);
  const p = launch(t, process.execPath, [cli, ...sampleArgs, '--wait', '--diffFormat', 'invalid'], { cwd: f.root, env: f.env });
  assert.equal((await p.closed)[0], 1);
  assert.deepEqual(await readdir(f.temp), []);
});

test('--open without --wait requires a persistent report', { timeout: 20000 }, async (t) => {
  const f = await fixture(t);
  const p = launch(t, process.execPath, [cli, ...sampleArgs, 'diff', '--open'], { cwd: f.root, env: f.env });
  assert.equal((await p.closed)[0], 1);
  assert.match(p.output().stderr, /requires --report or --wait/);
  assert.deepEqual(await readdir(f.temp), []);
});

test('git difftool --dir-diff keeps Git inputs alive until Enter', { timeout: 20000 }, async (t) => {
  const f = await fixture(t);
  const git = (...args) => execFileSync('git', args, { cwd: f.root, env: f.env, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  await cp(join(repo, 'sample/expected/sample0.png'), join(f.root, 'image.png'));
  git('add', 'image.png');
  git('commit', '-qm', 'Expected');
  await cp(join(repo, 'sample/actual/sample0.png'), join(f.root, 'image.png'));
  await cp(join(repo, 'sample/actual/sample0.png'), join(f.root, 'added.png'));
  git('add', '.');
  git('commit', '-qm', 'Actual');
  git('config', 'difftool.reg.cmd', `${quote(process.execPath)} ${quote(cli)} --open --wait --ignoreChange "$REMOTE" "$LOCAL"`);
  const p = launch(t, 'git', ['difftool', '--dir-diff', '--no-prompt', '--tool=reg', 'HEAD^', 'HEAD'], { cwd: f.root, env: f.env });
  await p.ready;
  const report = fileURLToPath(await readFile(f.env.OPEN_LOG, 'utf8'));
  const json = JSON.parse(await readFile(join(dirname(report), 'reg.json'), 'utf8'));
  assert.deepEqual(json.newItems, ['added.png']);
  assert.deepEqual(json.deletedItems, []);
  assert.deepEqual(json.failedItems, ['image.png']);
  const actual = resolve(dirname(report), decodeURIComponent(json.actualDir), 'image.png');
  const expected = resolve(dirname(report), decodeURIComponent(json.expectedDir), 'image.png');
  assert.deepEqual(await readFile(actual), await readFile(join(repo, 'sample/actual/sample0.png')));
  assert.deepEqual(await readFile(expected), await readFile(join(repo, 'sample/expected/sample0.png')));
  assert.equal(p.child.exitCode, null);
  p.child.stdin.write('\n');
  assert.equal((await p.closed)[0], 0);
  await assert.rejects(stat(report));
  await assert.rejects(stat(actual));
  await assert.rejects(stat(expected));
  assert.deepEqual(await readdir(f.temp), []);
});

test('--open with explicit report returns without waiting', { timeout: 20000 }, async (t) => {
  const f = await fixture(t);
  const p = launch(t, process.execPath, [cli, ...sampleArgs, 'diff', '-R', 'report with spaces.html', '--open', '-I'], { cwd: f.root, env: f.env });
  assert.equal((await p.closed)[0], 0);
  assert.equal(fileURLToPath(await readFile(f.env.OPEN_LOG, 'utf8')), join(f.root, 'report with spaces.html'));
  await stat(join(f.root, 'report with spaces.html'));
  assert.doesNotMatch(p.output().stdout, /Press Enter/);
});

test('LFS dir-diff smudges historical images in the test clone', { timeout: 30000 }, async (t) => {
  try { execFileSync('git', ['lfs', 'version'], { stdio: 'ignore' }); }
  catch { t.skip('git-lfs is not installed'); return; }
  const f = await fixture(t);
  const source = join(f.root, 'source');
  const checkout = join(f.root, 'checkout');
  await mkdir(source);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: f.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(source, 'init', '-q');
  git(source, 'config', 'user.name', 'Test');
  git(source, 'config', 'user.email', 'test@example.com');
  // Install filters without touching the developer's configured hook directory.
  git(source, 'lfs', 'install', '--local', '--skip-repo');
  git(source, 'lfs', 'track', '*.png');
  await cp(join(repo, 'sample/expected/sample0.png'), join(source, 'image.png'));
  git(source, 'add', '.');
  git(source, 'commit', '-qm', 'Expected');
  await cp(join(repo, 'sample/actual/sample0.png'), join(source, 'image.png'));
  git(source, 'add', '.');
  git(source, 'commit', '-qm', 'Actual');
  execFileSync('git', ['clone', source, checkout], { env: { ...f.env, GIT_LFS_SKIP_SMUDGE: '1' }, stdio: 'pipe' });
  // Installing filters in the source alone does not configure this clone.
  git(checkout, 'lfs', 'install', '--local', '--skip-repo');
  assert.match(await readFile(join(checkout, 'image.png'), 'utf8'), /version https:\/\/git-lfs/);
  git(checkout, 'lfs', 'pull');
  assert.deepEqual(await readFile(join(checkout, 'image.png')), await readFile(join(repo, 'sample/actual/sample0.png')));
  // pull fetched only HEAD's object. dir-diff must fetch the historical one.
  const oid = git(checkout, 'show', 'HEAD^:image.png').match(/oid sha256:([a-f0-9]+)/)[1];
  const historicalObject = join(checkout, '.git/lfs/objects', oid.slice(0, 2), oid.slice(2, 4), oid);
  await assert.rejects(stat(historicalObject));
  git(checkout, 'config', 'difftool.reg.cmd', `${quote(process.execPath)} ${quote(cli)} --open --wait --ignoreChange "$REMOTE" "$LOCAL"`);
  const p = launch(t, 'git', ['difftool', '--dir-diff', '--no-prompt', '--tool=reg', 'HEAD^', 'HEAD'], { cwd: checkout, env: f.env });
  await p.ready;
  const report = fileURLToPath(await readFile(f.env.OPEN_LOG, 'utf8'));
  const json = JSON.parse(await readFile(join(dirname(report), 'reg.json'), 'utf8'));
  assert.deepEqual(json.failedItems, ['image.png']);
  await stat(historicalObject);
  for (const [key, sample] of [['actualDir', 'actual'], ['expectedDir', 'expected']]) {
    const image = resolve(dirname(report), decodeURIComponent(json[key]), 'image.png');
    assert.deepEqual(await readFile(image), await readFile(join(repo, 'sample', sample, 'sample0.png')));
  }
  p.child.stdin.write('\n');
  assert.equal((await p.closed)[0], 0);
  assert.deepEqual(await readdir(f.temp), []);
});
