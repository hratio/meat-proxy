import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, readlink, realpath, readdir, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Config } from '$lib/config';
import type { DiffFile, FileState, Review } from '$lib/types';
import { atomicWrite } from './settings';
import { blobOid, digest, EMPTY_TREE, git } from './git';
import { mapLimit } from '../review/concurrency';
import { treeEntries, readBlobs, type TreeEntry } from './git-objects';
import { ReviewVersions } from '../review/versions';

const exec = promisify(execFile);
const missing: FileState = { id: digest('missing'), exists: false, mode: '000000', bytes: 0, binary: false };
const quote = (path: string) => /[\t\n"\\]/.test(path) ? JSON.stringify(path) : path;

export class VersionStore extends ReviewVersions {
  private heads = new Map<string, FileState>();
  private patches = new Map<string, DiffFile>();
  private written = new Set<string>();
  constructor(dataDir: string, review: Review, config: Config) {
    super(join(dataDir, 'versions', `${review.id}-${Date.parse(review.createdAt)}`), review, config);
  }
  protected readSnapshot(state: FileState) { return readFile(join(this.directory, state.blob!), 'utf8'); }

  private async store(bytes: Buffer, mode: string, omitted?: string, fingerprint = ''): Promise<FileState> {
    const blob = omitted ? undefined : digest(bytes);
    if (blob && !this.written.has(blob)) {
      await atomicWrite(join(this.directory, blob), bytes);
      this.written.add(blob);
    }
    return { id: digest(`${mode}:${blob || fingerprint}`), exists: true, mode, bytes: bytes.length, binary: bytes.includes(0), blob, gitOid: omitted ? undefined : blobOid(bytes, this.review.selection.targetOid.length), omitted };
  }

  protected async readHeads(paths: string[], head: string) {
    const states = new Map<string, FileState>();
    const pending: string[] = [];
    for (const path of paths) {
      const cached = head === EMPTY_TREE ? missing : this.heads.get(`${head}:${path}`);
      if (cached) states.set(path, cached); else pending.push(path);
    }
    if (!pending.length) return states;
    const tree = await treeEntries(this.review.selection.worktree, head, pending, this.config);
    const blobs: { path: string; entry: TreeEntry }[][] = [];
    let chunk: { path: string; entry: TreeEntry }[] = [], bytes = 0;
    for (const path of pending) {
      const entry = tree.get(path);
      if (!entry) { states.set(path, missing); continue; }
      if (entry.type !== 'blob' || entry.bytes > this.config.server.maxFileBytes) {
        const state = await this.store(Buffer.alloc(0), entry.mode, entry.type !== 'blob' ? 'Git submodule' : 'File exceeds the configured snapshot size.', entry.oid);
        state.bytes = entry.bytes;
        states.set(path, state);
        continue;
      }
      if (chunk.length && (chunk.length >= 32 || bytes + entry.bytes > 4 * 1024 * 1024)) { blobs.push(chunk); chunk = []; bytes = 0; }
      chunk.push({ path, entry }); bytes += entry.bytes;
    }
    if (chunk.length) blobs.push(chunk);
    await mapLimit(blobs, 2, async group => {
      const contents = await readBlobs(this.review.selection.worktree, group.map(item => item.entry), this.config);
      await mapLimit(group, 8, async ({ path, entry }, index) => { states.set(path, await this.store(contents[index], entry.mode)); });
    });
    for (const path of pending) {
      if (this.heads.size >= this.config.server.maxFiles) this.heads.delete(this.heads.keys().next().value!);
      this.heads.set(`${head}:${path}`, states.get(path)!);
    }
    return states;
  }

  protected async readWorking(path: string): Promise<FileState> {
    const worktree = this.review.selection.worktree;
    if (isAbsolute(path) || path.split('/').includes('..')) throw new Error('Invalid file path.');
    const full = resolve(worktree, path);
    try {
      const parent = relative(worktree, await realpath(dirname(full)));
      if (parent === '..' || parent.startsWith('../') || isAbsolute(parent)) throw new Error('File parent is outside the worktree.');
      const stat = await lstat(full);
      const mode = stat.isSymbolicLink() ? '120000' : stat.isDirectory() ? '160000' : stat.mode & 0o111 ? '100755' : '100644';
      if (stat.isSymbolicLink()) return this.store(Buffer.from(await readlink(full)), mode);
      if (!stat.isFile() || stat.size > this.config.server.maxFileBytes) {
        let fingerprint = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
        if (stat.isDirectory()) {
          try { fingerprint = (await git(full, ['rev-parse', 'HEAD'], this.config)).trim(); } catch { /* An uninitialized submodule has no object yet. */ }
        }
        const state = await this.store(Buffer.alloc(0), mode, stat.isDirectory() ? 'Git submodule' : 'File exceeds the configured snapshot size.', fingerprint);
        state.bytes = stat.size;
        return state;
      }
      return this.store(await readFile(full), mode);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) return missing;
      throw error;
    }
  }

  protected reuseDiscovered(path: string, before: FileState, after: FileState, file: DiffFile) {
    if (file.binary || before.binary || after.binary || file.omitted || before.omitted || after.omitted) return;
    const index = file.patch.match(/^index ([a-f0-9]+)\.\.([a-f0-9]+)(?: (\d+))?$/m);
    if (!index) return;
    const oldMode = file.patch.match(/^(?:old|deleted file) mode (\d+)$/m)?.[1] || index[3];
    const newMode = file.patch.match(/^(?:new|new file) mode (\d+)$/m)?.[1] || index[3];
    const matches = (state: FileState, oid: string, mode?: string) => state.exists
      ? !!state.gitOid && state.gitOid === oid && state.mode === mode : /^0+$/.test(oid);
    if (!matches(before, index[1], oldMode) || !matches(after, index[2], newMode)) return;
    const key = `${path}:${before.id}:${after.id}:${this.config.review.contextLines}`;
    if (this.patches.size >= this.config.server.maxFiles * 2) this.patches.delete(this.patches.keys().next().value!);
    this.patches.set(key, { ...file, revision: after.id, status: !after.exists ? 'D' : !before.exists ? 'A' : 'M' });
  }

  protected async diff(path: string, before: FileState, after: FileState): Promise<DiffFile> {
    const key = `${path}:${before.id}:${after.id}:${this.config.review.contextLines}`;
    const cached = this.patches.get(key);
    if (cached) return cached;
    const status = !after.exists ? 'D' : !before.exists ? 'A' : 'M';
    const binary = before.binary || after.binary;
    const omitted = before.omitted || after.omitted;
    let patch = '';
    if (before.id !== after.id && !binary && !omitted) {
      const oldPath = before.exists ? join(this.directory, before.blob!) : '/dev/null';
      const newPath = after.exists ? join(this.directory, after.blob!) : '/dev/null';
      try {
        const { stdout } = await exec('git', ['diff', '--no-index', '--text', '--no-ext-diff', '--no-textconv', '--no-color', `--unified=${this.config.review.contextLines}`, '--', oldPath, newPath], { encoding: 'utf8', maxBuffer: this.config.server.maxDiffBytes, timeout: this.config.server.gitTimeoutMs });
        patch = stdout;
      } catch (error) {
        const result = error as { code?: number; stdout?: string };
        if (result.code !== 1 || result.stdout === undefined) throw error;
        patch = result.stdout;
      }
      patch = patch.replace(/^diff --git .*$/m, () => `diff --git ${quote(`a/${path}`)} ${quote(`b/${path}`)}`)
        .replace(/^--- .*$/m, () => `--- ${before.exists ? quote(`a/${path}`) : '/dev/null'}`)
        .replace(/^\+\+\+ .*$/m, () => `+++ ${after.exists ? quote(`b/${path}`) : '/dev/null'}`);
      if (!patch) patch = `diff --git ${quote(`a/${path}`)} ${quote(`b/${path}`)}\n`;
      patch = patch.replace(/^new file mode .*$/m, `new file mode ${after.mode}`).replace(/^deleted file mode .*$/m, `deleted file mode ${before.mode}`);
      if (before.exists && after.exists && before.mode !== after.mode) patch = patch.replace(/^(diff --git .*\n)/, `$1old mode ${before.mode}\nnew mode ${after.mode}\n`);
    }
    const lines = patch.split('\n');
    const file: DiffFile = { path, status, patch, revision: after.id, binary, omitted,
      additions: lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length,
      deletions: lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length };
    if (Buffer.byteLength(patch) > this.config.server.maxFileBytes) { file.patch = ''; file.omitted = 'Diff exceeds the configured preview size.'; }
    if (this.patches.size >= this.config.server.maxFiles * 2) this.patches.delete(this.patches.keys().next().value!);
    this.patches.set(key, file);
    return file;
  }

  async collectUnused() {
    const retained = new Set(Object.values(this.review.fileHistory).flatMap(history => Object.values(history.states).flatMap(state => state.blob ? [state.blob] : [])));
    let names: string[];
    try { names = await readdir(this.directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const name of names) if (/^[a-f0-9]{64}$/.test(name) && !retained.has(name)) {
      await unlink(join(this.directory, name)); this.written.delete(name);
    }
  }
}
