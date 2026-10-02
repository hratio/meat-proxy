import type { Review } from '$lib/types';
import { sealRound } from './rounds';

// Only keep completion when the completed rounds form an unbroken chain from
// the new HEAD contents to the unchanged, completed working file.
export function carryReview(previous: Review, createdAt: string): Review {
  const next = structuredClone(previous);
  next.createdAt = next.updatedAt = createdAt;
  next.baselineOid = next.selection.targetOid;
  next.findings = next.findings.filter(finding => finding.status === 'open');
  next.carriedFindingIds = next.findings.map(finding => finding.id);
  // Jobs from the previous generation cannot resolve this reconciled review.
  next.dispatchedFindingIds = [];
  next.reviewed = {};
  next.fileRounds = {};
  next.history = [];
  next.cursor = next.revision = 0;
  delete next.finishedAt;
  for (const [path, history] of Object.entries(previous.fileHistory)) {
    const current = history.versions.at(-1);
    if (!current || previous.reviewed[path] !== current.id || current.state.id === history.head.id) continue;
    let covered = history.head.id;
    for (const round of previous.fileRounds[path] || []) {
      if (round.completedAt && round.comparison.base === covered) covered = round.comparison.head;
    }
    if (covered !== current.state.id) continue;
    next.reviewed[path] = current.id;
    next.fileRounds[path] = sealRound([], current.id, {
      kind: 'latest', base: history.head.id, head: current.state.id, baseLabel: 'HEAD', headLabel: 'Live'
    }, createdAt);
  }
  next.checkpoint = structuredClone({ findings: next.findings, reviewed: next.reviewed, fileRounds: next.fileRounds });
  return next;
}
