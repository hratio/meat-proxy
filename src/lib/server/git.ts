import { fileContents } from '../review/contents';
export { fileContents } from '../review/contents';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Config } from '$lib/config';
import type { CommitPage, DiffContents, DiffFile, Repository, Selection, SelectionInput, Worktree } from '$lib/types';

const exec = promisify(execFile);
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const blobOid = (bytes: Buffer, oidLength = 40) => createHash(oidLength === 64 ? 'sha256' : 'sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export async function git(cwd: string, args: string[], config: Config) {
  const { stdout } = await exec('git', ['-c', 'core.quotePath=false', ...args], {
    cwd, encoding: 'utf8', maxBuffer: config.server.maxDiffBytes,
    timeout: config.server.gitTimeoutMs, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }
  });
  return stdout;
}

async function maybeGit(cwd: string, args: string[], config: Config) {
  try { return (await git(cwd, args, config)).trim(); } catch { return ''; }
}

export async function repository(cwd: string, config: Config): Promise<Repository> {
  let root: string;
  try { root = (await git(cwd, ['rev-parse', '--show-toplevel'], config)).trim(); }
  catch { throw new Error(`No Git repository at ${cwd}. Run from a Git repository, or choose one with --dir <path>.`); }
  root = await realpath(root);
  const [common, worktreeText, branchText, logText, statusText, head] = await Promise.all([
    git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'], config),
    git(root, ['worktree', 'list', '--porcelain', '-z'], config),
    git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'], config),
    maybeGit(root, ['log', `-${config.server.commitLimit}`, '--format=%H%x09%s'], config),
    git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], config),
    maybeGit(root, ['rev-parse', '--verify', 'HEAD'], config)
  ]);
  const worktrees: Worktree[] = [];
  for (const entry of worktreeText.split('\0\0')) {
    const lines = entry.split('\0');
    const path = lines.find(l => l.startsWith('worktree '))?.slice(9);
    if (!path || lines.includes('bare') || lines.some(l => l.startsWith('prunable'))) continue;
    worktrees.push({ path, branch: lines.find(l => l.startsWith('branch '))?.slice(7).replace('refs/heads/', '') || 'detached HEAD', head: lines.find(l => l.startsWith('HEAD '))?.slice(5) || '' });
  }
  let unstaged = 0, staged = 0, untracked = 0;
  const records = statusText.split('\0');
  for (let i = 0; i < records.length; i++) {
    const s = records[i];
    if (!s) continue;
    if (s.startsWith('??')) untracked++;
    else {
      if (s[0] !== ' ') staged++;
      if (s[1] !== ' ') unstaged++;
      if (s[0] === 'R' || s[0] === 'C') i++;
    }
  }
  const suggestion: SelectionInput = { mode: 'live', worktree: root };
  return { root, commonDir: common.trim(), name: basename(root), worktrees, branches: branchText.trim().split('\n').filter(Boolean), commits: logText.split('\n').filter(Boolean).map(l => { const [oid, ...subject] = l.split('\t'); return { oid, subject: subject.join('\t') }; }), unstaged, staged, untracked, head: head || undefined, suggestion, demo: false };
}

export async function commitPage(worktree: string, branch: string, before: string | undefined, offset: number, repo: Repository, config: Config): Promise<CommitPage> {
  worktree = await realpath(resolve(worktree));
  if (!repo.worktrees.some(w => resolve(w.path) === worktree)) throw new Error('Select a worktree belonging to this repository.');
  if (branch !== 'HEAD' && !repo.branches.includes(branch)) throw new Error('Select a branch from this repository.');
  const head = await maybeGit(worktree, ['rev-parse', '--verify', '--end-of-options', `${branch}^{commit}`], config);
  if (!head) return { commits: [], hasMore: false };
  const anchor = before ? (await git(worktree, ['rev-parse', '--verify', '--end-of-options', `${before}^{commit}`], config)).trim() : head;
  const [parent, anchorParent, log] = await Promise.all([
    maybeGit(worktree, ['rev-parse', '--verify', `${head}^`], config),
    maybeGit(worktree, ['rev-parse', '--verify', `${anchor}^`], config),
    git(worktree, ['log', '--topo-order', `--skip=${offset + (before ? 1 : 0)}`, `-${config.server.commitLimit + 1}`, '--format=%H%x09%s', anchor, '--'], config)
  ]);
  const commits = log.trimEnd().split('\n').filter(Boolean).map(line => {
    const [oid, ...subject] = line.split('\t');
    return { oid, subject: subject.join('\t') };
  });
  return { head, parent: parent || undefined, anchorParent: anchorParent || undefined, commits: commits.slice(0, config.server.commitLimit), hasMore: commits.length > config.server.commitLimit };
}

export async function pinSelection(input: SelectionInput, repo: Repository, config: Config): Promise<Selection> {
  const worktree = await realpath(resolve(input.worktree));
  if (!repo.worktrees.some(w => resolve(w.path) === worktree)) throw new Error('Select a worktree belonging to this repository.');
  const pin = async (ref: string) => {
    if (ref === EMPTY_TREE) return ref;
    return (await git(worktree, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], config)).trim();
  };
  const sourceOid = input.mode === 'compare' ? await pin(input.sourceRef || 'HEAD') : undefined;
  const targetOid = input.mode === 'compare' ? await pin(input.targetRef || 'HEAD') : await currentHead(worktree, config);
  if (input.mode === 'compare') {
    if (sourceOid === targetOid) throw new Error('Choose two different commits.');
    if (sourceOid === EMPTY_TREE) throw new Error('The source must be a commit.');
    if (input.sourceBranch && input.sourceBranch === input.targetBranch && targetOid !== EMPTY_TREE) {
      try { await git(worktree, ['merge-base', '--is-ancestor', targetOid, sourceOid!], config); }
      catch { throw new Error('On the same branch, the target must be an earlier ancestor of the source.'); }
    }
  }
  return { ...input, worktree, sourceOid, targetOid,
    sourceLabel: input.mode === 'compare' ? `${input.sourceBranch || input.sourceRef} · ${sourceOid!.slice(0, 7)}` : 'Working tree',
    targetLabel: targetOid === EMPTY_TREE ? 'Empty tree' : `${input.mode === 'compare' ? input.targetBranch || input.targetRef : 'HEAD'} · ${targetOid.slice(0, 7)}`
  };
}

export async function currentHead(worktree: string, config: Config) {
  return await maybeGit(worktree, ['rev-parse', '--verify', 'HEAD'], config) || EMPTY_TREE;
}


export async function readCommitContents(selection: Selection, file: DiffFile, config: Config): Promise<DiffContents> {
  const read = async (oid: string, path: string) => {
    if (oid === EMPTY_TREE) return '';
    const entry = (await git(selection.worktree, ['--literal-pathspecs', 'ls-tree', '-z', oid, '--', path], config)).split('\0')[0];
    if (!entry) return '';
    const [, type, blob] = entry.split('\t')[0].split(' ');
    if (type !== 'blob') throw new Error('This file has no expandable text contents.');
    const size = Number(await git(selection.worktree, ['cat-file', '-s', blob], config));
    if (size > config.server.maxFileBytes) throw new Error('Full file exceeds server.maxFileBytes.');
    const text = await git(selection.worktree, ['cat-file', 'blob', blob], config);
    if (text.includes('\0')) throw new Error('Binary files cannot be expanded.');
    return text;
  };
  const [before, after] = await Promise.all([
    file.status === 'A' ? '' : read(selection.targetOid, file.oldPath || file.path),
    file.status === 'D' ? '' : read(selection.sourceOid!, file.path)
  ]);
  return fileContents(file.path, file.comparison!, before, after, file.oldPath);
}

function unquotePath(value: string) {
  if (value.startsWith('"')) { try { return JSON.parse(value); } catch { return value.slice(1, -1); } }
  return value;
}

export async function readDiff(selection: Selection, config: Config): Promise<{ files: DiffFile[]; warning?: string }> {
  const { worktree, mode, targetOid, sourceOid } = selection;
  const refs = mode === 'compare' ? [targetOid, sourceOid!] : [targetOid];
  const args = ['diff', '--full-index', '--no-ext-diff', '--no-textconv', '--no-color', mode === 'live' ? '--no-renames' : '--find-renames', `--unified=${config.review.contextLines}`, '--src-prefix=a/', '--dst-prefix=b/', ...refs, '--'];
  const patch = await git(worktree, args, config);
  const files: DiffFile[] = [];
  for (const chunk of patch.split(/(?=^diff --git )/m).filter(Boolean)) {
    // Git terminates unquoted header paths containing spaces with a tab.
    // Literal tabs in filenames are quoted, so remove only the header separator.
    const oldHeader = chunk.match(/^--- (.+)$/m)?.[1].replace(/\t$/, '');
    const newHeader = chunk.match(/^\+\+\+ (.+)$/m)?.[1].replace(/\t$/, '');
    const renameTo = chunk.match(/^rename to (.+)$/m)?.[1];
    const renameFrom = chunk.match(/^rename from (.+)$/m)?.[1];
    const headerMatch = chunk.split('\n')[0].match(/^diff --git ("a\/.*?"|a\/.*?) ("b\/.*"|b\/.*)$/);
    const oldPath = unquotePath(renameFrom || oldHeader || headerMatch?.[1] || '').replace(/^a\//, '');
    const newPath = unquotePath(renameTo || newHeader || headerMatch?.[2] || '').replace(/^b\//, '');
    const path = newPath === '/dev/null' ? oldPath : newPath;
    const lines = chunk.split('\n');
    files.push({ path, oldPath: oldPath !== path && oldPath !== '/dev/null' ? oldPath : undefined,
      status: /^new file mode /m.test(chunk) ? 'A' : /^deleted file mode /m.test(chunk) ? 'D' : renameTo ? 'R' : 'M',
      patch: chunk, revision: digest(chunk), additions: lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length,
      deletions: lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length,
      binary: /^Binary files /m.test(chunk),
      comparison: { kind: mode === 'compare' ? 'compare' : 'head', base: `git:${targetOid}:${oldPath}`, head: `git:${sourceOid || 'working'}:${path}`, baseLabel: selection.targetLabel, headLabel: selection.sourceLabel }
    });
  }
  let untrackedOverflow = 0;
  if (mode === 'live' && config.review.includeUntracked) {
    const paths = (await git(worktree, ['ls-files', '--others', '--exclude-standard', '-z'], config)).split('\0').filter(Boolean);
    untrackedOverflow = Math.max(0, paths.length - config.server.maxFiles);
    for (const path of paths.slice(0, config.server.maxFiles)) {
      const full = join(worktree, path);
      let content: Buffer, omitted: string | undefined, diskVersion = '';
      try {
        const info = await lstat(full);
        diskVersion = `${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
        if (info.isSymbolicLink()) { omitted = 'Untracked symbolic link. File target is not read.'; content = Buffer.alloc(0); }
        else if (info.size > config.server.maxFileBytes) { omitted = 'File exceeds the configured preview size.'; content = Buffer.alloc(0); }
        else content = await readFile(full);
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      const binary = content.includes(0);
      const text = content.toString('utf8');
      const lines = text ? text.replace(/\n$/, '').split('\n') : [];
      const quote = (s: string) => /[\t\n"\\]/.test(s) ? JSON.stringify(s) : s;
      const untrackedPatch = `diff --git ${quote(`a/${path}`)} ${quote(`b/${path}`)}\nnew file mode 100644\nindex ${'0'.repeat(targetOid.length)}..${blobOid(content, targetOid.length)}\n--- /dev/null\n+++ ${quote(`b/${path}`)}\n` + (binary ? `Binary files /dev/null and b/${path} differ\n` : lines.length ? `@@ -0,0 +1,${lines.length} @@\n${lines.map(l => `+${l}`).join('\n')}\n${!text.endsWith('\n') ? '\\ No newline at end of file\n' : ''}` : '');
      files.push({ path, status: '?', patch: untrackedPatch, revision: digest(Buffer.concat([Buffer.from(untrackedPatch + (omitted ? diskVersion : '')), content])), additions: binary ? 0 : lines.length, deletions: 0, binary, omitted });
    }
  }
  const total = files.length + untrackedOverflow;
  let bytes = 0;
  const limited = files.slice(0, config.server.maxFiles).map(file => {
    bytes += Buffer.byteLength(file.patch);
    if (Buffer.byteLength(file.patch) > config.server.maxFileBytes || bytes > config.server.maxDiffBytes) return { ...file, patch: '', omitted: 'Diff exceeds the configured preview size. File-wide findings remain available.' };
    return file;
  });
  return { files: limited, warning: total > config.server.maxFiles ? `Showing ${config.server.maxFiles} of ${total} files. Increase server.maxFiles to review all files; completion is disabled while truncated.` : undefined };
}
