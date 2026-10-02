import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ReviewService } from './service';
import { readReview, writeReview } from './api';
import type { ReviewEngine } from './engine';
import type { ReviewPlatform } from './platform';

const exec = promisify(execFile);
let directory: string, repository: string, platform: ReviewPlatform, service: ReviewService;
const services: ReviewService[] = [];
const git = (...args: string[]) => exec('git', ['-c', 'user.name=Reviewer', '-c', 'user.email=reviewer@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd: repository });
const open = async () => {
  const next = new ReviewService(platform);
  services.push(next);
  return next.init();
};
const aim = (engine: ReviewEngine, path = 'ready.txt') => {
  const file = engine.files.find(file => file.path === path)!;
  return { path, revision: file.revision, comparison: file.comparison };
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'meat-proxy-review-'));
  repository = join(directory, 'repository');
  await mkdir(repository);
  vi.stubEnv('GIT_CONFIG_GLOBAL', join(directory, 'no-global-config'));
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('MEAT_PROXY_CONFIG', join(directory, 'settings/config.toml'));
  vi.stubEnv('MEAT_PROXY_REPO', repository);
  vi.stubEnv('MEAT_PROXY_DATA_DIR', join(directory, 'reviews'));
  await git('init', '--initial-branch=main');
  await writeFile(join(repository, 'ready.txt'), 'old\n');
  await writeFile(join(repository, 'draft.txt'), 'before\n');
  await git('add', '.');
  await git('commit', '-m', 'Initial files');
  await writeFile(join(repository, 'ready.txt'), 'new\n');
  await git('add', 'ready.txt');
  await writeFile(join(repository, 'draft.txt'), 'work in progress\n');
  await writeFile(join(repository, 'new.txt'), 'untracked\n');
  vi.resetModules();
  const { serverPlatform } = await import('../server/platform');
  platform = { ...serverPlatform, loadSettings: async () => {
    const settings = await serverPlatform.loadSettings();
    settings.config.server.pollMs = 60_000;
    return settings;
  } };
  service = await open();
});

afterEach(async () => {
  for (const instance of services.splice(0)) await instance.stop();
  vi.unstubAllEnvs();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('bootstrap and file contents expose staged, unstaged and untracked Git changes', async () => {
  const engine = await service.get();
  const url = new URL('http://localhost/api/bootstrap');
  const response = await readReview({ params: { endpoint: 'bootstrap' }, url, request: new Request(url), engine, service, commitPage: platform.commitPage });
  expect(response.status).toBe(200);
  const bootstrap = await response.json();
  expect(bootstrap.repo).toMatchObject({ root: repository, staged: 1, unstaged: 1, untracked: 1 });
  expect(bootstrap.snapshot.files.map((file: { path: string }) => file.path).sort()).toEqual(['draft.txt', 'new.txt', 'ready.txt']);
  const file = aim(engine);
  const contents = await engine.fileContents(engine.review.id, file.path, file.comparison!);
  expect(contents.oldFile.contents).toBe('old\n');
  expect(contents.newFile.contents).toBe('new\n');
  await expect(service.get('../outside')).rejects.toThrow('Invalid review ID');
});

test('concurrent requests share a review and saved feedback survives discard and restart', async () => {
  const engine = await service.get();
  const [first, second] = await Promise.all([service.get(engine.review.id), service.get(engine.review.id)]);
  expect(first).toBe(second);
  await Promise.all(['First comment', 'Second comment'].map(comment => engine.action({ type: 'comment', aim: aim(engine), comment }, engine.review.id)));
  await engine.action({ type: 'save' }, engine.review.id);
  await engine.action({ type: 'comment', aim: aim(engine), comment: 'Discard me' }, engine.review.id);
  await engine.action({ type: 'discard' }, engine.review.id);
  await service.stop();
  const reopened = await (await open()).get(engine.review.id);
  expect(reopened.review.findings.map(finding => finding.comment)).toEqual(['First comment', 'Second comment']);
});

test('the API rejects stale and malformed writes without losing newer feedback', async () => {
  const engine = await service.get();
  const revision = engine.review.revision;
  await engine.action({ type: 'comment', aim: aim(engine), comment: 'Keep this' }, engine.review.id);
  const url = new URL('http://localhost/api/action');
  const call = (action: unknown, headers: Record<string, string>) => writeReview({
    params: { endpoint: 'action' }, url, engine, service, commitPage: platform.commitPage,
    request: new Request(url, { method: 'POST', headers, body: JSON.stringify({ reviewId: engine.review.id, action }) })
  });
  const stale = await call({ type: 'discard' }, { 'X-Review-Revision': String(revision) });
  expect(stale.status).toBe(400);
  expect((await stale.json()).error).toMatch(/another tab/);
  const restarted = await call({ type: 'save' }, { 'X-Review-Generation': '2000-01-01T00:00:00.000Z' });
  expect(restarted.status).toBe(400);
  expect((await restarted.json()).error).toMatch(/restarted or reconciled/);
  expect((await call({ type: 'not-an-action' }, {})).status).toBe(400);
  expect(engine.review.findings.map(finding => finding.comment)).toEqual(['Keep this']);
});

test('worktree reviews stay separate and commit comparisons remain pinned when HEAD moves', async () => {
  const first = await service.get();
  const worktree = join(directory, 'other-worktree');
  await git('worktree', 'add', '-b', 'feature', worktree);
  await writeFile(join(worktree, 'ready.txt'), 'other worktree\n');
  const second = await service.select(first, { mode: 'live', worktree });
  expect(second.review.id).not.toBe(first.review.id);
  expect(first.review.selection.worktree).toBe(repository);
  await first.action({ type: 'comment', aim: aim(first), comment: 'Only in the first review' }, first.review.id);
  expect(second.review.findings).toEqual([]);
  await git('commit', '-m', 'Update ready file');
  const comparison = await service.select(second, { mode: 'compare', worktree: repository, sourceRef: 'HEAD', targetRef: 'HEAD^' });
  const pinned = comparison.review.selection.sourceOid;
  await git('add', 'draft.txt');
  await git('commit', '-m', 'Advance HEAD');
  expect((await platform.currentHead(repository, first.config))).not.toBe(pinned);
  expect((await service.get(comparison.review.id)).review.selection.sourceOid).toBe(pinned);
  expect(comparison.files.map(file => file.path)).toEqual(['ready.txt']);
});

test('dispatch includes completed feedback only and agent retries stay deduplicated after restart', async () => {
  const engine = await service.get();
  await engine.action({ type: 'comment', aim: aim(engine), comment: 'Ready feedback' }, engine.review.id);
  const finding = engine.review.findings[0];
  await engine.action({ type: 'comment', aim: aim(engine, 'draft.txt'), comment: 'Still drafting' }, engine.review.id);
  await engine.action({ type: 'review-file', ...aim(engine) }, engine.review.id);
  const dispatched = await engine.dispatch(engine.review.id);
  const job = JSON.parse(await readFile(dispatched.path, 'utf8'));
  expect(dispatched.summary).toEqual({ findings: 1, files: 1, held: 1 });
  expect(job.review.findings.map((item: { id: string }) => item.id)).toEqual([finding.id]);
  expect(job.diff.map((file: { path: string }) => file.path)).toEqual(['ready.txt']);
  const feedback = { reviewId: engine.review.id, reviewGeneration: engine.review.createdAt, feedbackId: 'one-response', replies: [{ id: finding.id, comment: 'Addressed' }], resolutions: [] };
  await service.agentFeedback(feedback);
  await service.agentFeedback(feedback);
  await service.stop();
  const restarted = await open();
  await restarted.agentFeedback(feedback);
  const restored = await restarted.get(engine.review.id);
  expect(restored.review.findings.find(item => item.id === finding.id)?.replies).toHaveLength(1);
  expect(restored.review.findings.find(item => item.path === 'draft.txt')?.status).toBe('open');
});
