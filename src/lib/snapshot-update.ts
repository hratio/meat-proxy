import { reconcileSnapshot } from './review-state';
import type { Snapshot, SnapshotUpdate } from './types';

// The journal, checkpoints and stored file versions belong on the server.
// Transport only changed entities; an ordinary shot has no file payload.
export function snapshotUpdate(previous: Snapshot, current: Snapshot): SnapshotUpdate {
  const next = reconcileSnapshot(previous, current);
  const beforeFiles = new Map(previous.files.map(file => [file.path, file]));
  const afterFiles = new Set(next.files.map(file => file.path));
  const beforeFindings = new Map(previous.review.findings.map(finding => [finding.id, finding]));
  const afterFindings = new Set(next.review.findings.map(finding => finding.id));
  const reviewed: SnapshotUpdate['reviewed'] = {};
  for (const path of new Set([...Object.keys(previous.review.reviewed), ...Object.keys(next.review.reviewed)])) {
    if (previous.review.reviewed[path] !== next.review.reviewed[path]) reviewed[path] = next.review.reviewed[path] ?? null;
  }
  const orderChanged = previous.files.length !== next.files.length || next.files.some((file, index) => previous.files[index].path !== file.path);
  const { findings, reviewed: _reviewed, ...review } = next.review;
  return {
    fromRevision: previous.review.revision,
    review,
    dirty: next.dirty,
    warning: next.warning,
    lastDispatch: next.lastDispatch,
    findings: {
      set: findings.filter(finding => beforeFindings.get(finding.id) !== finding),
      remove: previous.review.findings.filter(finding => !afterFindings.has(finding.id)).map(finding => finding.id)
    },
    reviewed,
    files: {
      set: next.files.filter(file => beforeFiles.get(file.path) !== file),
      remove: previous.files.filter(file => !afterFiles.has(file.path)).map(file => file.path),
      ...(orderChanged ? { order: next.files.map(file => file.path) } : {})
    }
  };
}

export function applySnapshotUpdate(previous: Snapshot, update: SnapshotUpdate): Snapshot | undefined {
  if (previous.review.id !== update.review.id || previous.review.createdAt !== update.review.createdAt || previous.review.revision !== update.fromRevision) return;
  const findings = new Map(previous.review.findings.map(finding => [finding.id, finding]));
  for (const id of update.findings.remove) findings.delete(id);
  for (const finding of update.findings.set) findings.set(finding.id, finding);
  const reviewed = { ...previous.review.reviewed };
  for (const [path, revision] of Object.entries(update.reviewed)) {
    if (revision === null) delete reviewed[path];
    else reviewed[path] = revision;
  }
  let files = previous.files;
  if (update.files.set.length || update.files.remove.length || update.files.order) {
    const changed = new Map(files.map(file => [file.path, file]));
    for (const path of update.files.remove) changed.delete(path);
    for (const file of update.files.set) changed.set(file.path, file);
    files = update.files.order ? update.files.order.map(path => changed.get(path)!) : [...changed.values()];
  }
  return {
    review: { ...update.review, findings: [...findings.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), reviewed },
    files,
    dirty: update.dirty,
    warning: update.warning,
    lastDispatch: update.lastDispatch
  };
}
