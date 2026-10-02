import type { DiffFile, Finding } from './types';

export type FindingProgress = { total: number; resolved: number; undispatched: number };

export function findingProgress(findings: Finding[], dispatchedFindingIds: readonly string[] = []): FindingProgress {
  const dispatched = new Set(dispatchedFindingIds);
  let resolved = 0, undispatched = 0;
  for (const finding of findings) {
    if (finding.status === 'resolved') resolved++;
    else if (!dispatched.has(finding.id)) undispatched++;
  }
  // Resolution can happen without dispatch. Count it once, as completed work.
  return { total: findings.length, resolved, undispatched };
}

export function reviewDelta(files: DiffFile[], reviewed: Record<string, string>) {
  let additions = 0, deletions = 0, covered = 0;
  for (const file of files) {
    const delta = file.selectionDelta ?? file;
    additions += delta.additions;
    deletions += delta.deletions;
    if (reviewed[file.path] === file.revision) covered += delta.additions + delta.deletions;
  }
  return { additions, deletions, total: additions + deletions, covered };
}
