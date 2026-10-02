import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createFixtureRepository } from './repository.mjs';
import { repositoryRoot } from '../root.mjs';

// The website contains only this deliberately fictional training repository.
const repository = await createFixtureRepository();
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const hash = value => createHash('sha256').update(value).digest('hex');
try {
  // A disposable Pages-only target for the first-visit combat introduction.
  await writeFile(join(repository, 'src/instant-approval.ts'), `// Instant approval: what could possibly go wrong?
export function approveEverything(changes: string[]) {
  const verdict = 'looks good to me';
  const confidence = 100;
  const tests = 'probably passing';
  const security = 'someone else checked';
  const reviewed = changes.map(file => ({
    file,
    verdict,
    confidence,
    tests,
    security,
    inspectedLines: 0,
    skippedChecks: ['types', 'logic', 'reality'],
    approved: true
  }));
  console.log('Ship it. No questions.');
  return { reviewed, mistakes: 0 };
}
export const deployOnFriday = true;
`);
  const paths = [...new Set([...git('diff', '--name-only', 'HEAD').trim().split('\n'), ...git('ls-files', '--others', '--exclude-standard').trim().split('\n')])].filter(Boolean).sort();
  const files = [];
  for (const path of paths) {
    let before = '';
    try { before = git('show', `HEAD:${path}`); } catch {}
    const after = await readFile(join(repository, path), 'utf8');
    const patch = before ? git('diff', '--no-ext-diff', '--no-textconv', '--no-color', '--unified=4', 'HEAD', '--', path)
      : `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${after.trimEnd().split('\n').length} @@\n${after.trimEnd().split('\n').map(line => '+' + line).join('\n')}\n`;
    files.push({ path, before, after, patch, base: hash(before), head: hash(after), status: before ? 'M' : 'A' });
  }
  const unchanged = Object.fromEntries(git('ls-files').trim().split('\n').filter(path => !paths.includes(path)).map(path => [path, git('show', `HEAD:${path}`)]));
  await mkdir(join(repositoryRoot, 'site'), { recursive: true });
  await writeFile(join(repositoryRoot, 'site/fixture.json'), JSON.stringify({ name: 'overkill-checkout', branch: 'feat/express-checkout', files, unchanged }, null, 2) + '\n');
  console.log(`Prepared ${files.length} fictional review files.`);
} finally { await rm(repository, { recursive: true, force: true }); }
