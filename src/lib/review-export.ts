import { inactiveCodes } from './catalog-actions';
import { hasLocation, rangeLabel } from './location';
import type { Catalog, Config } from './config';
import type { Snapshot } from './types';

export function exportReview(review: Snapshot['review'], files: Snapshot['files'], catalog: Catalog, format: 'json' | 'markdown', options: Config['export'], appName = 'meat-proxy') {
  const inactive = inactiveCodes(catalog);
  const findings = review.findings.filter(f => (!f.code || !inactive.has(f.code)) && (options.includeResolved || f.status === 'open')).map(f => ({
    id: f.id, path: f.path, ...(f.ranges ? { ranges: f.ranges } : {}),
    ...(f.code ? { code: f.code } : {}), ...(f.comment ? { comment: f.comment } : {}), status: f.status,
    ...(!f.code ? { role: f.role || 'reviewer', createdAt: f.createdAt, replies: f.replies || [] } : {}),
    ...(f.resolution ? { resolution: f.resolution } : {}),
    ...(f.comparison ? { comparison: { base: f.comparison.base, head: f.comparison.head } } : {}),
    ...(f.version ? { version: f.version } : {}), ...(f.resolvedVersion ? { resolvedVersion: f.resolvedVersion } : {}),
    inCurrentDiff: hasLocation(files, f)
  }));
  const definitions = new Map(catalog.groups.flatMap(g => g.codes).map(rule => [rule.id, rule]));
  // Preserve referenced definitions across catalog imports, once per code in the export.
  for (const finding of review.findings) if (finding.rule && !definitions.has(finding.rule.id)) definitions.set(finding.rule.id, finding.rule);
  const rules = [...definitions.values()].filter(rule => !inactive.has(rule.id)).map(({ id, title, description, severity, bad, good }) => ({ id, title, description, severity, ...(options.includeExamples ? { bad, good } : {}) }));
  const artifact = { schemaVersion: 5, app: appName, reviewId: review.id, selection: review.selection, findings, ...(options.includeCatalog ? { catalog: rules } : {}) };
  if (format === 'json') return artifact;
  const lines = [`# ${appName} — review findings`, '', `Review: ${review.id}`, `Worktree: ${review.selection.worktree}`, `Source: ${review.selection.sourceLabel}`, `Target: ${review.selection.targetLabel}`, ''];
  for (const f of findings) lines.push(`## ${f.code || 'Comment'} · ${f.path}${f.ranges ? `:${rangeLabel(f, true)}` : ' (whole file)'}`, `ID: ${f.id} · ${f.status}${f.inCurrentDiff ? '' : ' · outside current diff'}`, '',
    ...(f.comment ? [...(!f.code ? [`### ${f.role === 'agent' ? 'Agent' : 'Reviewer'} · ${f.createdAt}`, ''] : []), f.comment, ''] : []),
    ...(f.replies || []).flatMap(reply => [`### ${reply.role === 'agent' ? 'Agent' : 'Reviewer'} · ${reply.createdAt}`, '', reply.comment, '']),
    ...(f.resolution ? [`Resolution: ${f.resolution}`, ''] : []));
  if (options.includeCatalog) {
    lines.push('## V-code catalog', '');
    for (const rule of rules) lines.push(`### ${rule.id} — ${rule.title}`, `[${rule.severity}] ${rule.description}`, ...(rule.bad ? ['', 'Bad:', '````', rule.bad, '````'] : []), ...(rule.good ? ['', 'Good:', '````', rule.good, '````'] : []), '');
  }
  return lines.join('\n');
}
