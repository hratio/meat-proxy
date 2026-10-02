import { mkdirSync, realpathSync, readFileSync, openSync, writeFileSync, closeSync, unlinkSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const registry = globalThis[Symbol.for('meat-proxy.storage-owners')] ||= new Map();
const alive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
};
export function readOwner(directory) {
  try { return JSON.parse(readFileSync(join(directory, 'server.lock'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw new Error(`Cannot read server ownership in ${directory}. Check for an interrupted startup.`); }
}
export class StorageOwnedError extends Error {
  constructor(owner) {
    super(`This review storage is already owned by a server${owner.url ? ` at ${owner.url}` : ''} (PID ${owner.pid}). Open that server, or use a separate --data-dir.`);
    this.owner = owner;
  }
}

/** Lifetime ownership, retained across Vite module replacement. Never steal a live owner's lock. */
export function acquireStorage(directory, url) {
  mkdirSync(directory, { recursive: true });
  directory = realpathSync(directory);
  const existing = registry.get(directory);
  if (existing) return existing;
  // Older releases have no lock. Refuse to overwrite a still-running legacy owner.
  if (!readOwner(directory)) {
    let legacy;
    try { legacy = JSON.parse(readFileSync(join(directory, 'connection.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (legacy?.pid && legacy.pid !== process.pid && alive(legacy.pid)) throw new StorageOwnedError(legacy);
  }
  const path = join(directory, 'server.lock');
  const owner = { pid: process.pid, url, instance: randomUUID(), startedAt: new Date().toISOString() };
  const claim = () => {
    const fd = openSync(path, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify(owner)); } finally { closeSync(fd); }
  };
  try { claim(); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = readOwner(directory);
    if (!previous || alive(previous.pid)) throw new StorageOwnedError(previous || {});
    // Serialize recovery too: two starters must never unlink each other's new lock.
    const recovery = join(directory, 'server-lock-recovery');
    try { mkdirSync(recovery); } catch { throw new Error('Another server is recovering this storage. Retry the launch.'); }
    try {
      const current = readOwner(directory);
      if (current && alive(current.pid)) throw new StorageOwnedError(current);
      if (current) unlinkSync(path);
      try { claim(); } catch (failure) { if (failure.code === 'EEXIST') throw new StorageOwnedError(readOwner(directory) || {}); throw failure; }
    } finally { rmdirSync(recovery); }
  }
  const release = () => {
    try { if (readOwner(directory)?.instance === owner.instance) unlinkSync(path); } catch { /* Preserve ownership evidence if storage is unavailable. */ }
    registry.delete(directory);
    process.off('exit', release);
  };
  const result = { ...owner, directory, release };
  registry.set(directory, result);
  process.once('exit', release);
  return result;
}
