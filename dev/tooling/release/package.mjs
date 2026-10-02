import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../../../', import.meta.url));

// Keep using the CLI that invoked npm run, even if a dependency vendors npm.
export function npm(args, options = {}) {
  const cli = process.env.npm_execpath;
  return execFileSync(cli ? process.execPath : 'npm', cli ? [cli, ...args] : args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 16 * 1024 * 1024, ...options
  });
}

export function checkContents(paths) {
  const exact = new Set(['package.json', 'README.md', 'LICENSE', '.env.example', 'bin/meat-proxy.mjs', 'bin/server-ownership.mjs', 'config/catalog.v1.json', 'config/studio.json', 'docs/attribution.md']);
  for (const path of paths) {
    assert(!path.split('/').some(part => part === '..' || part === '.'), `Unsafe package path: ${path}`);
    assert(path === '.env.example' || !/(^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.git|\.aws|\.codex|\.agents)(?:\/|$)/.test(path), `Private file in package: ${path}`);
    assert(!/\.(?:map(?:\.(?:gz|br))?|log|blend\d*|fbx|har)$/i.test(path), `Authoring/debug file in package: ${path}`);
    assert(exact.has(path) || /^(?:build\/|schemas\/[^/]+\.json$|skills\/[^/]+\/SKILL\.md$|docs\/licenses\/[^/]+\.txt$)/.test(path), `Unexpected package file: ${path}`);
  }
  for (const required of [...exact, 'build/handler.js', 'build/client/THIRD_PARTY_NOTICES.md', 'docs/licenses/Apache-2.0.txt', 'docs/licenses/UI.txt', 'docs/licenses/Runtime.txt', 'docs/licenses/Draco.txt', 'docs/licenses/Noble-hashes.txt', 'docs/licenses/JsDiff.txt', 'schemas/config.schema.json', 'skills/review-agent/SKILL.md']) {
    assert(paths.includes(required), `Missing package file: ${required}`);
  }
}

export async function smokePackage(tarball) {
  tarball = resolve(tarball);
  const paths = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n').filter(path => !path.endsWith('/')).map(path => {
    assert(path.startsWith('package/'), `Unexpected archive path: ${path}`);
    return path.slice('package/'.length);
  });
  checkContents(paths);
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' }));
  assert.equal(manifest.name, 'meat-proxy');
  assert.equal(manifest.repository.url, 'git+https://github.com/hratio/meat-proxy.git');
  const directory = await mkdtemp(join(tmpdir(), 'meat-proxy-package-'));
  let server, exited;
  let output = '';
  try {
    const install = join(directory, 'install');
    const repository = join(directory, 'repository');
    await mkdir(install);
    await mkdir(repository);
    await writeFile(join(install, 'package.json'), '{"private":true}\n');
    npm(['install', '--prefix', install, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', tarball], { stdio: 'inherit' });
    const installed = join(install, 'node_modules/meat-proxy');
    const cli = join(install, 'node_modules/.bin/meat-proxy');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('MEAT_PROXY_')));
    env.XDG_CONFIG_HOME = join(directory, 'config');
    assert.equal(execFileSync(process.execPath, [cli, '--version'], { cwd: repository, env, encoding: 'utf8' }).trim(), manifest.version);
    assert.match(execFileSync(process.execPath, [cli, '--help'], { cwd: repository, env, encoding: 'utf8' }), /--no-open/);
    const git = args => execFileSync('git', args, { cwd: repository, stdio: 'pipe' });
    git(['init', '--initial-branch=main']);
    await writeFile(join(repository, 'README.md'), 'Package smoke test\n');
    git(['add', 'README.md']);
    git(['-c', 'user.name=Package Test', '-c', 'user.email=package-test@localhost', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Initial fixture']);
    const config = join(directory, 'config.toml');
    await writeFile(config, '');
    const listener = createServer();
    await new Promise((accept, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', accept); });
    const port = listener.address().port;
    await new Promise(accept => listener.close(accept));
    server = spawn(process.execPath, [cli, '--no-open', '--dir', repository, '--config', config, '--data-dir', join(directory, 'data'), '--port', String(port)], { cwd: repository, env, stdio: ['ignore', 'pipe', 'pipe'] });
    exited = new Promise(accept => { server.once('exit', accept); server.once('error', error => { output += error.message; accept(-1); }); });
    server.stdout.on('data', data => { output += data; });
    server.stderr.on('data', data => { output += data; });
    const url = `http://127.0.0.1:${port}`;
    let ready = false;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && server.exitCode === null) {
      try {
        const response = await fetch(`${url}/api/server`, { signal: AbortSignal.timeout(1500) });
        if (response.ok && (await response.json()).pid === server.pid) { ready = true; break; }
      } catch { /* Wait for the installed server to listen. */ }
      await delay(150);
    }
    assert(ready, `Installed server did not start:\n${output}`);
    for (const path of ['/', '/models/weapons/manifest.json', '/THIRD_PARTY_NOTICES.md']) {
      const response = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200, `Installed package must serve ${path}`);
      assert((await response.text()).length > 0, `Empty response for ${path}`);
    }
    assert.equal(JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version, manifest.version);
    console.log(`Verified ${manifest.name}@${manifest.version}: ${paths.length} files, isolated install, CLI, server, assets, and notices.`);
  } finally {
    if (server?.exitCode === null) {
      server.kill('SIGTERM');
      const kill = setTimeout(() => server.kill('SIGKILL'), 5000);
      try { await exited; } finally { clearTimeout(kill); }
    }
    await rm(directory, { recursive: true, force: true });
  }
  return manifest;
}

export async function buildPackage() {
  const directory = join(root, 'tmp/release');
  await mkdir(directory, { recursive: true });
  npm(['run', 'build'], { stdio: 'inherit' });
  const [pack] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', directory]));
  const tarball = join(directory, pack.filename);
  checkContents(pack.files.map(file => file.path));
  await writeFile(join(directory, 'package-contents.json'), `${JSON.stringify(pack, null, 2)}\n`);
  const sha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
  await writeFile(join(directory, 'SHA256SUMS'), `${sha256}  ${basename(tarball)}\n`);
  await smokePackage(tarball);
  return { tarball, pack, sha256 };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2]) await smokePackage(process.argv[2]);
  else await buildPackage();
}
