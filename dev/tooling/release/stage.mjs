import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPackage, npm } from './package.mjs';

export function verifyConditions(_config, { cwd, env }) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Releases run in GitHub Actions.');
  assert.equal(env.GITHUB_REPOSITORY, 'hratio/meat-proxy', 'Unexpected release repository.');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Only main can stage a release.');
  assert(['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME), 'Unexpected release event.');
  assert(env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, 'npm staging requires GitHub OIDC.');
  execFileSync('git', ['rev-parse', '--verify', 'refs/tags/v0.0.0'], { cwd, stdio: 'pipe' });
  execFileSync('git', ['merge-base', '--is-ancestor', 'v0.0.0', 'HEAD'], { cwd, stdio: 'pipe' });
}

export async function prepare(_config, context) {
  const { nextRelease } = context;
  npm(['version', nextRelease.version, '--no-git-tag-version', '--allow-same-version', '--ignore-scripts'], { stdio: 'inherit' });
  await buildPackage();
  // A failed upload must not consume the Git release tag. Staging is preparation;
  // public npm publication remains a separate, human-approved action.
  await stagePackage(context);
}

async function stagePackage({ cwd, env, nextRelease, logger }) {
  const directory = join(cwd, 'tmp/release');
  const pack = JSON.parse(await readFile(join(directory, 'package-contents.json'), 'utf8'));
  assert.equal(pack.version, nextRelease.version);
  // Stage the already-tested tarball. Never run npm publish or npm stage approve here.
  const receipt = npm(['stage', 'publish', join(directory, pack.filename), '--access', 'public', '--tag', 'latest', '--ignore-scripts', '--json']);
  await writeFile(join(directory, 'staging.json'), receipt);
  logger.log('Staged %s@%s. Review it on npm and approve it with 2FA when ready.', pack.name, nextRelease.version);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `\nStaged **${pack.name}@${nextRelease.version}** from \`${nextRelease.gitTag}\`. Review the staging receipt and tarball in this run's release artifact. The version becomes public on npm only after your 2FA approval.\n`);
}

export function publish() {
  return { name: 'npm staging (approval required)', url: 'https://www.npmjs.com/package/@hratioed/meat-proxy' };
}
