import type { Finding, Snapshot } from './types';

// Snapshots are JSON values. Keep equal branches by reference so a review action
// doesn't invalidate every file, finding and history control in the page.
function share<T>(previous: T, next: T, retained?: Set<object>): T {
  if (previous === next) return previous;
  if (previous === null || next === null || typeof previous !== 'object' || typeof next !== 'object') return next;
  if (retained?.has(next)) return next;
  if (Array.isArray(previous) !== Array.isArray(next)) return next;
  const before = previous as Record<string, unknown>, after = next as Record<string, unknown>;
  const keys = Object.keys(after);
  let equal = Object.keys(before).length === keys.length;
  let result: Record<string, unknown> | undefined;
  for (const key of keys) {
    const value = share(before[key], after[key], retained);
    if (value !== after[key]) {
      result ??= (Array.isArray(next) ? [...next] : { ...next }) as Record<string, unknown>;
      result[key] = value;
    }
    if (value !== before[key] || !Object.hasOwn(before, key)) equal = false;
  }
  return equal ? previous : (result as T | undefined) ?? next;
}

export function reconcileSnapshot(previous: Snapshot | undefined, next: Snapshot): Snapshot {
  if (!previous || previous.review.id !== next.review.id || previous.review.createdAt !== next.review.createdAt) return next;
  // Reconcile files by path, including when another file is inserted or removed.
  const files = new Map(previous.files.map(file => [file.path, file]));
  const findings = new Map(previous.review.findings.map(finding => [finding.id, finding]));
  return share(previous, {
    ...next,
    files: next.files.map(file => {
      const before = files.get(file.path);
      // A manifest can repeat the same patch identity without its body. Keep
      // the inline first patch across finding-only HTTP/SSE updates.
      if (file.patchPending && file.patchKey && before && !before.patchPending && before.patchKey === file.patchKey) file = { ...file, patch: before.patch, patchPending: false };
      return share(before, file)!;
    }),
    review: { ...next.review, findings: next.review.findings.map(finding => share(findings.get(finding.id), finding)!) }
  }, new Set([...previous.files, ...previous.review.findings]));
}

export function groupFindings(findings: Finding[], previous: Map<string, Finding[]>): Map<string, Finding[]> {
  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    const list = grouped.get(finding.path) || [];
    list.push(finding);
    grouped.set(finding.path, list);
  }
  for (const [path, list] of grouped) {
    const before = previous.get(path);
    if (before?.length === list.length && before.every((finding, index) => finding === list[index])) grouped.set(path, before);
  }
  return grouped;
}
