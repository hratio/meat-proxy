import { sha256 } from '@noble/hashes/sha2.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createTwoFilesPatch } from 'diff';
import fixture from './fixture.json';
import type { Config } from '../src/lib/config';
import type { CommitPage, DiffFile, Repository, Selection, SelectionInput } from '../src/lib/types';
import { EMPTY_TREE } from '../src/lib/review/platform';
import { fileContents } from '../src/lib/review/contents';
import { BrowserFiles } from './filesystem';

const encode = (text: string) => new TextEncoder().encode(text);
export const digest = (text: string) => bytesToHex(sha256(encode(text)));
export const blobOid = (text: string) => bytesToHex(sha1(encode(`blob ${encode(text).length}\0${text}`)));
export const root = '/workspace/overkill-checkout';
export const secondaryRoot = '/workspace/overkill-checkout-main';
const repositoryFile = '/repository.json';
export type Tree = Record<string, string>;
type Commit = { oid: string; parent?: string; subject: string; tree: Tree };
type Worktree = { path: string; branch: string; head: string; files: Tree };
type State = { commits: Record<string, Commit>; branches: Record<string, string>; worktrees: Worktree[]; completedJobs: string[] };

export function diffFile(path: string, before: string | undefined, after: string | undefined, config: Config): DiffFile {
  const status = after === undefined ? 'D' : before === undefined ? 'A' : 'M';
  const binary = (before || '').includes('\0') || (after || '').includes('\0');
  let patch = '';
  if (before !== after) {
    const header = `diff --git a/${path} b/${path}\n` + (status === 'A' ? 'new file mode 100644\n' : status === 'D' ? 'deleted file mode 100644\n' : '')
      + `index ${before === undefined ? '0'.repeat(40) : blobOid(before)}..${after === undefined ? '0'.repeat(40) : blobOid(after)}${status === 'M' ? ' 100644' : ''}\n`;
    const diff = binary ? `Binary files a/${path} and b/${path} differ\n`
      : createTwoFilesPatch(before === undefined ? '/dev/null' : `a/${path}`, after === undefined ? '/dev/null' : `b/${path}`, before || '', after || '', '', '', { context: config.review.contextLines }).replace(/^=+\n/, '').replace(/^(---|\+\+\+) ([^\n]*?)\t\s*$/gm, '$1 $2');
    patch = header + diff;
  }
  const lines = patch.split('\n');
  const file: DiffFile = { path, status, patch, revision: digest(patch), binary,
    additions: lines.filter(line => line.startsWith('+') && !line.startsWith('+++')).length,
    deletions: lines.filter(line => line.startsWith('-') && !line.startsWith('---')).length };
  if (encode(patch).length > config.server.maxFileBytes) { file.patch = ''; file.omitted = 'Diff exceeds the configured preview size.'; }
  return file;
}

/** Git's immutable commit trees, refs and working copies for the browser environment. */
export class BrowserRepository {
  state!: State;
  constructor(private fs: BrowserFiles) {}
  async init() {
    try { this.state = JSON.parse(await this.fs.readFile(repositoryFile)); }
    catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      await this.reset();
    }
    return this;
  }
  async reset() {
    this.state = { commits: {}, branches: {}, worktrees: [], completedJobs: [] };
    const before: Tree = { ...fixture.unchanged, ...Object.fromEntries(fixture.files.filter(file => file.status !== 'A').map(file => [file.path, file.before])) };
    const after: Tree = { ...fixture.unchanged, ...Object.fromEntries(fixture.files.map(file => [file.path, file.after])) };
    const first = this.addCommit({ ...before, 'src/lib/database.ts': before['src/lib/database.ts'].replace('poolSize: 10', 'poolSize: 5') }, 'feat: establish checkout service');
    const main = this.addCommit(before, 'fix: increase connection pool capacity', first);
    const feature = this.addCommit({ ...before, 'src/types.ts': after['src/types.ts'], 'README.md': after['README.md'] }, 'feat: describe express checkout', main);
    const proposal = this.addCommit(after, 'feat: implement express checkout', feature);
    this.state.branches = { main, [fixture.branch]: feature, 'proposal/express-checkout': proposal };
    this.state.worktrees = [
      { path: root, branch: fixture.branch, head: feature, files: after },
      { path: secondaryRoot, branch: 'main', head: main, files: { ...before, 'src/lib/database.ts': before['src/lib/database.ts'].replace('poolSize: 10', 'poolSize: 12') } }
    ];
    await this.save();
  }
  addCommit(tree: Tree, subject: string, parent?: string) {
    const payload = JSON.stringify([parent, subject, Object.entries(tree).sort(([a], [b]) => a.localeCompare(b))]);
    const oid = bytesToHex(sha1(encode(payload)));
    this.state.commits[oid] = { oid, parent, subject, tree: structuredClone(tree) }; return oid;
  }
  save() { return this.fs.atomicWrite(repositoryFile, JSON.stringify(this.state)); }
  worktree(path: string) {
    const tree = this.state.worktrees.find(tree => tree.path === path);
    if (!tree) throw new Error('Select a worktree belonging to this repository.');
    return tree;
  }
  resolve(ref: string, worktree: string) {
    if (ref === EMPTY_TREE) return ref;
    const oid = ref === 'HEAD' ? this.worktree(worktree).head : this.state.branches[ref] || ref;
    if (!this.state.commits[oid]) throw new Error('Unknown commit or branch.');
    return oid;
  }
  tree(oid: string): Tree {
    if (oid === EMPTY_TREE) return {};
    const commit = this.state.commits[oid];
    if (!commit) throw new Error('Unknown commit.');
    return commit.tree;
  }
  private history(head: string) {
    const entries: { oid: string; subject: string }[] = [];
    for (let commit: Commit | undefined = this.state.commits[head]; commit; commit = this.state.commits[commit.parent || '']) entries.push({ oid: commit.oid, subject: commit.subject });
    return entries;
  }
  repository = async (path: string, config: Config): Promise<Repository> => {
    const tree = this.worktree(path), baseline = this.tree(tree.head);
    return { root: path, commonDir: '/repository.git', name: path.split('/').at(-1)!,
      worktrees: this.state.worktrees.map(({ path, branch, head }) => ({ path, branch, head })), branches: Object.keys(this.state.branches),
      commits: this.history(tree.head).slice(0, config.server.commitLimit),
      unstaged: Object.keys(baseline).filter(path => baseline[path] !== tree.files[path]).length, staged: 0,
      untracked: Object.keys(tree.files).filter(path => !(path in baseline)).length,
      head: tree.head, suggestion: { mode: 'live', worktree: path }, demo: true };
  };
  currentHead = async (path: string) => this.worktree(path).head;
  commitPage = async (worktree: string, branch: string, before: string | undefined, offset: number, _repo: Repository, config: Config): Promise<CommitPage> => {
    this.worktree(worktree);
    if (branch !== 'HEAD' && !this.state.branches[branch]) throw new Error('Select a branch from this repository.');
    const head = this.resolve(branch, worktree), anchor = before ? this.resolve(before, worktree) : head;
    const all = this.history(anchor).slice(offset + (before ? 1 : 0));
    return { head, parent: this.state.commits[head]?.parent, anchorParent: this.state.commits[anchor]?.parent, commits: all.slice(0, config.server.commitLimit), hasMore: all.length > config.server.commitLimit };
  };
  pinSelection = async (input: SelectionInput): Promise<Selection> => {
    this.worktree(input.worktree);
    const sourceOid = input.mode === 'compare' ? this.resolve(input.sourceRef, input.worktree) : undefined;
    const targetOid = input.mode === 'compare' ? this.resolve(input.targetRef, input.worktree) : await this.currentHead(input.worktree);
    if (input.mode === 'compare') {
      if (sourceOid === targetOid) throw new Error('Choose two different commits.');
      if (sourceOid === EMPTY_TREE) throw new Error('The source must be a commit.');
      if (input.sourceBranch && input.sourceBranch === input.targetBranch && targetOid !== EMPTY_TREE && !this.history(sourceOid!).some(commit => commit.oid === targetOid)) throw new Error('On the same branch, the target must be an earlier ancestor of the source.');
    }
    return { ...input, sourceOid, targetOid,
      sourceLabel: input.mode === 'compare' ? `${input.sourceBranch || input.sourceRef} · ${sourceOid!.slice(0, 7)}` : 'Working tree',
      targetLabel: targetOid === EMPTY_TREE ? 'Empty tree' : `${input.mode === 'compare' ? input.targetBranch || input.targetRef : 'HEAD'} · ${targetOid.slice(0, 7)}` };
  };
  readDiff = async (selection: Selection, config: Config) => {
    const before = this.tree(selection.targetOid), after = selection.mode === 'compare' ? this.tree(selection.sourceOid!) : this.worktree(selection.worktree).files;
    const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => before[path] !== after[path]).sort();
    const files = paths.filter(path => selection.mode === 'compare' || config.review.includeUntracked || path in before).map(path => {
      const file = diffFile(path, before[path], after[path], config);
      return { ...file, status: selection.mode === 'live' && !(path in before) ? '?' : file.status,
        comparison: { kind: selection.mode === 'compare' ? 'compare' as const : 'head' as const, base: `git:${selection.targetOid}:${path}`, head: `git:${selection.sourceOid || 'working'}:${path}`, baseLabel: selection.targetLabel, headLabel: selection.sourceLabel } };
    });
    return { files };
  };
  readCommitContents = async (selection: Selection, file: DiffFile, config: Config) => {
    const before = this.tree(selection.targetOid)[file.oldPath || file.path] || '', after = this.tree(selection.sourceOid!)[file.path] || '';
    if ([before, after].some(text => encode(text).length > config.server.maxFileBytes || text.includes('\0'))) throw new Error('This file has no expandable text contents.');
    return fileContents(file.path, file.comparison!, before, after, file.oldPath);
  };
  async commitWorking(path: string, subject: string) {
    const tree = this.worktree(path);
    tree.head = this.addCommit(tree.files, subject, tree.head);
    this.state.branches[tree.branch] = tree.head;
    await this.save(); return tree.head;
  }
}
