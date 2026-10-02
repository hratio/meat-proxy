import { diffLines } from 'diff';
import type { Finding, Review, Selection } from '../src/lib/types';
import type { BrowserSession } from './platform';

// Locate the original range in the working text, including deleted lines and
// shifts from earlier amendments in this dispatch. Deleted lines use the gap.
function workingLine(before: string, after: string, line: number) {
  let oldLine = 1, newLine = 0;
  for (const part of diffLines(before, after)) {
    if (part.added) { newLine += part.count; continue; }
    if (line < oldLine + part.count) return newLine + (part.removed ? 0 : line - oldLine);
    oldLine += part.count;
    if (!part.removed) newLine += part.count;
  }
  return newLine;
}

function amendComment(path: string, text: string, index: number, dispatchId: string) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n', lines = text.split(/\r?\n/);
  index = Math.min(index, lines.length - 1);
  const amendment = /^\s*(?:\/\/|\/\*|<!--) Demo agent amendment: /;
  // Reuse our own adjacent comment so repeated reviews don't grow the file.
  if (!amendment.test(lines[index]) && index > 0 && amendment.test(lines[index - 1])) index--;
  const prefix = lines.slice(0, index).join('\n');
  const markup = /\.(svelte|html|md)$/.test(path);
  const script = markup && prefix.lastIndexOf('<script') > prefix.lastIndexOf('</script>');
  const style = /\.css$/.test(path) || markup && prefix.lastIndexOf('<style') > prefix.lastIndexOf('</style>');
  const note = `Demo agent amendment: ${dispatchId}`;
  const comment = style ? `/* ${note} */` : markup && !script ? `<!-- ${note} -->` : `// ${note}`;
  const indentation = lines[index].match(/^\s*/)?.[0] || '';
  lines.splice(index, amendment.test(lines[index]) ? 1 : 0, indentation + comment);
  return lines.join(newline);
}

export async function runBrowserAgent(session: BrowserSession, dispatchId: string, reviewId: string, commit = false) {
  const { engine, repository, files, platform } = session;
  if (repository.state.completedJobs.includes(dispatchId)) return { snapshot: engine.snapshot(), resolved: 0, changed: 0 };
  if (!/^\d+-[a-f0-9-]+$/.test(dispatchId)) throw new Error('Send feedback to the agent first.');
  const job = JSON.parse(await files.readFile(`${engine.dataDir}/outbox/${dispatchId}.json`)) as { review: { reviewId: string; selection: Selection; findings: Finding[] } };
  if (job.review.reviewId !== reviewId) throw new Error('This dispatch belongs to a different review.');
  const selection = job.review.selection, worktree = repository.worktree(selection.worktree);
  const current: Review = JSON.parse(await files.readFile(`${engine.dataDir}/reviews/${reviewId}.json`));
  const versions = platform.createVersions(engine.dataDir, current, engine.config);
  const feedback = job.review.findings.filter(sent => {
    const finding = current.findings.find(finding => finding.id === sent.id);
    return sent.status === 'open' && finding?.status === 'open' && finding.comment === sent.comment && JSON.stringify(finding.ranges) === JSON.stringify(sent.ranges)
      && JSON.stringify(finding.replies || []) === JSON.stringify(sent.replies || []);
  });
  const changed = new Set<string>(), notes = new Map<string, string>();
  for (const finding of feedback) {
    const text = worktree.files[finding.path];
    if (text === undefined) { notes.set(finding.id, 'The file has been removed from the working tree.'); continue; }
    const range = finding.ranges?.[0];
    let index = 0;
    if (range) {
      let source = text;
      if (selection.mode === 'compare') source = repository.tree(range.side === 'deletions' ? selection.targetOid : selection.sourceOid!)[finding.path] || '';
      else if (finding.comparison) {
        const contents = await versions.contents(finding.path, finding.comparison);
        source = (range.side === 'deletions' ? contents.oldFile : contents.newFile).contents;
      }
      index = workingLine(source, text, range.start);
    }
    worktree.files[finding.path] = amendComment(finding.path, text, index, dispatchId);
    changed.add(finding.path);
    notes.set(finding.id, 'I did the fix — now are you happy?');
  }
  if (commit && changed.size) await repository.commitWorking(selection.worktree, `fix: address review feedback (${dispatchId})`);
  else await repository.save();
  const resolutions = feedback.map(finding => ({ id: finding.id, note: notes.get(finding.id) }));
  const result = resolutions.length ? await engine.agentFeedback({ reviewId, resolutions, replies: [] }) : { resolved: 0 };
  repository.state.completedJobs.push(dispatchId); await repository.save();
  await engine.refreshRepo();
  return { snapshot: engine.snapshot(), resolved: result.resolved, changed: changed.size };
}
