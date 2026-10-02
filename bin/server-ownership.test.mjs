import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { acquireStorage, StorageOwnedError } from './server-ownership.mjs';
const moduleUrl = new URL('./server-ownership.mjs', import.meta.url).href;

test('ownership survives module reuse, excludes another process, and recovers after a crash', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'meat-proxy-owner-'));
  let child, owner;
  try {
    const source = `import { acquireStorage } from ${JSON.stringify(moduleUrl)}; acquireStorage(process.argv[1], 'http://127.0.0.1:6660'); console.log('ready'); setInterval(() => {}, 1000);`;
    child = spawn(process.execPath, ['--input-type=module', '-e', source, directory], { stdio: ['ignore', 'pipe', 'pipe'] });
    await once(child.stdout, 'data', { signal: AbortSignal.timeout(5000) });
    assert.throws(() => acquireStorage(directory, 'http://127.0.0.1:6661'), StorageOwnedError);
    const stopped = once(child, 'exit'); child.kill('SIGKILL'); await stopped;
    owner = acquireStorage(directory, 'http://127.0.0.1:6661');
    assert.equal(acquireStorage(directory, 'http://127.0.0.1:6662'), owner);
    assert.equal(JSON.parse(await readFile(join(directory, 'server.lock'), 'utf8')).pid, process.pid);
    owner.release(); owner = undefined;
    const next = acquireStorage(directory, 'http://127.0.0.1:6663'); next.release();
  } finally { child?.kill(); owner?.release(); await rm(directory, { recursive: true, force: true }); }
});
