import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import semanticRelease from 'semantic-release';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import config from '../../../release.config.mjs';
import { checkContents } from './package.mjs';
import { verifyConditions } from './stage.mjs';

test.each([
  ['chore: initial import', null],
  ['docs: explain configuration', null],
  ['feat: add the review arena', 'minor'],
  ['fix: repair startup', 'patch'],
  ['perf: reduce load time', 'patch'],
  ['feat!: replace the config format', 'major'],
  ['fix(server)!: remove an option', 'major'],
  ['feat: change config\n\nBREAKING CHANGE: old configs need migration', 'major']
])('%s chooses %s', async (message, release) => {
  expect(await analyzeCommits(config.plugins[0][1], {
    cwd: process.cwd(), commits: [{ hash: '0123456', message }], logger: { log() {} }
  })).toBe(release);
});

test.each(['build/client/.env.production', 'build/.npmrc', 'build/.aws/credentials', 'build/client/app.js.map', 'build/client/app.js.map.gz', 'build/../.env', 'dev/assets/source/private.png'])('rejects unexpected packed content: %s', path => {
  expect(() => checkContents([path])).toThrow(/Private file|Authoring\/debug file|Unsafe package path|Unexpected package file/);
});

test('refuses staging outside the intended GitHub main workflow', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'hratio/meat-proxy', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', ACTIONS_ID_TOKEN_REQUEST_URL: 'present', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'present' };
  for (const [key, value] of [['GITHUB_ACTIONS', 'false'], ['GITHUB_REPOSITORY', 'someone/fork'], ['GITHUB_REF', 'refs/pull/1/merge'], ['GITHUB_EVENT_NAME', 'pull_request'], ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', '']]) {
    expect(() => verifyConditions({}, { cwd: process.cwd(), env: { ...env, [key]: value } })).toThrow();
  }
});

test('the baseline yields 0.1.0, and a subsequent fix yields 0.1.1', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'meat-proxy-release-'));
  try {
    const checkout = join(directory, 'checkout');
    const remote = join(directory, 'remote.git');
    await mkdir(checkout);
    const git = (...args) => execFileSync('git', args, { cwd: checkout, stdio: 'pipe' });
    git('init', '--bare', '--initial-branch=main', remote);
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'release-test@localhost');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'tag.gpgsign', 'false');
    git('commit', '--allow-empty', '-m', 'chore: initial import');
    git('tag', 'v0.0.0');
    git('remote', 'add', 'origin', remote);
    git('commit', '--allow-empty', '-m', 'feat: add the review arena');
    git('push', 'origin', 'main', '--tags');
    const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const options = {
      branches: ['main'], repositoryUrl: remote, tagFormat: config.tagFormat,
      plugins: [[fileURLToPath(import.meta.resolve('@semantic-release/commit-analyzer')), config.plugins[0][1]]],
      dryRun: true, ci: false
    };
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:CI$|GITHUB_|GH_|GITLAB_|ACTIONS_)/.test(key)));
    const context = { cwd: checkout, env, stdout: sink, stderr: sink };
    expect((await semanticRelease(options, context)).nextRelease.version).toBe('0.1.0');
    git('tag', 'v0.1.0');
    git('commit', '--allow-empty', '-m', 'fix: repair startup');
    git('push', 'origin', 'main', '--tags');
    expect((await semanticRelease(options, context)).nextRelease.version).toBe('0.1.1');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
