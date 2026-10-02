import { inactiveCodes } from './catalog-actions';
import type { Catalog } from './config';
import type { Finding, Snapshot } from './types';

export type DispatchSummary = { findings: number; files: number; held: number };

// Reviewer edits and reopening need a new handoff; agent replies alone do not.
export function findingDispatchContent(finding: Finding) {
  return JSON.stringify([finding.path, finding.code, finding.comment, finding.status, finding.ranges, finding.comparison?.base, finding.comparison?.head, finding.version,
    finding.replies?.filter(reply => reply.role === 'reviewer').map(reply => [reply.id, reply.comment]) || []]);
}

// The button and outbox use the same eligibility rule. Completion applies only
// to the current file version; display filters never change the handoff.
export function dispatchScope(review: Snapshot['review'], files: Snapshot['files'], catalog: Catalog) {
  const inactive = inactiveCodes(catalog);
  const dispatched = new Set(review.dispatchedFindingIds);
  const completed = new Set(files.filter(file => review.reviewed[file.path] === file.revision).map(file => file.path));
  const open = review.findings.filter(finding => finding.status === 'open' && !dispatched.has(finding.id) && (!finding.code || !inactive.has(finding.code)));
  const findings = open.filter(finding => completed.has(finding.path));
  const paths = new Set(findings.map(finding => finding.path));
  const selected = files.filter(file => paths.has(file.path));
  return { findings, files: selected, summary: { findings: findings.length, files: selected.length, held: open.length - findings.length } };
}
