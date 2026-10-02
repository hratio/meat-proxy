import { execFile } from 'node:child_process';
import type { Config } from '$lib/config';
import { git } from './git';
import { mapLimit } from '../review/concurrency';

export type TreeEntry = { mode: string; type: string; oid: string; bytes: number };

// Literal pathspecs keep spaces, tabs, newlines, and wildcard characters safe.
// Chunk path arguments to stay below OS command-line limits on large reviews.
export async function treeEntries(worktree: string, head: string, paths: string[], config: Config) {
  const chunks: string[][] = [];
  for (let index = 0; index < paths.length; index += 128) chunks.push(paths.slice(index, index + 128));
  const entries = new Map<string, TreeEntry>();
  await mapLimit(chunks, 2, async chunk => {
    const output = await git(worktree, ['--literal-pathspecs', 'ls-tree', '-r', '-z', '-l', head, '--', ...chunk], config);
    for (const line of output.split('\0').filter(Boolean)) {
      const tab = line.indexOf('\t');
      const [mode, type, oid, size] = line.slice(0, tab).trim().split(/\s+/);
      entries.set(line.slice(tab + 1), { mode, type, oid, bytes: size === '-' ? 0 : Number(size) });
    }
  });
  return entries;
}

export async function readBlobs(worktree: string, entries: TreeEntry[], config: Config): Promise<Buffer[]> {
  if (!entries.length) return [];
  const maxBuffer = entries.reduce((sum, entry) => sum + entry.bytes + 128, 0);
  const output = await new Promise<Buffer>((resolve, reject) => {
    const child = execFile('git', ['cat-file', '--batch'], {
      cwd: worktree, encoding: 'buffer', maxBuffer, timeout: config.server.gitTimeoutMs,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }
    }, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin!.on('error', reject);
    child.stdin!.end(entries.map(entry => entry.oid).join('\n') + '\n');
  });
  let offset = 0;
  return entries.map(entry => {
    const end = output.indexOf(10, offset);
    if (end < 0) throw new Error('Incomplete Git object header.');
    const [oid, type, size] = output.subarray(offset, end).toString('ascii').split(' ');
    if (oid !== entry.oid || type !== 'blob' || Number(size) !== entry.bytes) throw new Error('Git object changed while reading its immutable snapshot.');
    offset = end + 1;
    const bytes = output.subarray(offset, offset + entry.bytes);
    offset += entry.bytes;
    if (bytes.length !== entry.bytes || output[offset++] !== 10) throw new Error('Incomplete Git object contents.');
    return bytes;
  });
}
