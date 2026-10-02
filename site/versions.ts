import { ReviewVersions } from '../src/lib/review/versions';
import type { Config } from '../src/lib/config';
import type { DiffFile, FileState, Review } from '../src/lib/types';
import { BrowserFiles, join } from './filesystem';
import { BrowserRepository, blobOid, diffFile, digest } from './repository';

const missing: FileState = { id: digest('missing'), exists: false, mode: '000000', bytes: 0, binary: false };

/** Only capture and diff I/O differ from the filesystem version store. */
export class BrowserVersions extends ReviewVersions {
  constructor(directory: string, review: Review, config: Config, private repo: BrowserRepository, private fs: BrowserFiles) {
    super(join(directory, 'versions', `${review.id}-${Date.parse(review.createdAt)}`), review, config);
  }
  private async store(text: string | undefined): Promise<FileState> {
    if (text === undefined) return missing;
    const bytes = new TextEncoder().encode(text).length, blob = digest(text), mode = '100644';
    const omitted = bytes > this.config.server.maxFileBytes ? 'File exceeds the configured snapshot size.' : undefined;
    if (!omitted) await this.fs.atomicWrite(join(this.directory, blob), text);
    return { id: digest(`${mode}:${blob}`), exists: true, mode, bytes, binary: text.includes('\0'), blob: omitted ? undefined : blob, gitOid: blobOid(text), omitted };
  }
  protected async readHeads(paths: string[], head: string) {
    const tree = this.repo.tree(head);
    return new Map(await Promise.all(paths.map(async path => [path, await this.store(tree[path])] as const)));
  }
  protected readWorking(path: string) { return this.store(this.repo.worktree(this.review.selection.worktree).files[path]); }
  protected readSnapshot(state: FileState) { return this.fs.readFile(join(this.directory, state.blob!)); }
  protected reuseDiscovered(_path: string, _before: FileState, _after: FileState, _file: DiffFile) { /* Browser diffs already use captured text. */ }
  protected async diff(path: string, before: FileState, after: FileState): Promise<DiffFile> {
    if (before.omitted || after.omitted) return { path, revision: after.id, status: !after.exists ? 'D' : !before.exists ? 'A' : 'M', patch: '', additions: 0, deletions: 0, binary: before.binary || after.binary, omitted: before.omitted || after.omitted };
    const file = diffFile(path, before.exists ? await this.readSnapshot(before) : undefined, after.exists ? await this.readSnapshot(after) : undefined, this.config);
    return { ...file, revision: after.id };
  }
  async collectUnused() {
    const retained = new Set(Object.values(this.review.fileHistory).flatMap(history => Object.values(history.states).flatMap(state => state.blob ? [state.blob] : [])));
    let names: string[];
    try { names = await this.fs.readdir(this.directory); } catch (error) { if ((error as { code?: string }).code === 'ENOENT') return; throw error; }
    for (const name of names) if (/^[a-f0-9]{64}$/.test(name) && !retained.has(name)) await this.fs.unlink(join(this.directory, name));
  }
}
