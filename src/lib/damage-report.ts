import MiniSearch from 'minisearch';
import type { Catalog } from './config';
import type { Finding } from './types';

export type ReportFinding = Finding & { groupName: string; groupColor: string };
export type ReportCounts = { violations: number; comments: number; unresolvedComments: number; unresolvedFindings: number };
export type ReportFile = ReportCounts & { path: string; findings: ReportFinding[] };
export type ReportSort = keyof ReportCounts;
export const reportSortOptions: { value: ReportSort; label: string }[] = [
  { value: 'violations', label: 'Number of violations' },
  { value: 'comments', label: 'Number of comments' },
  { value: 'unresolvedComments', label: 'Unresolved comments' },
  { value: 'unresolvedFindings', label: 'Unresolved findings' }
];

export function reportFindings(findings: Finding[], catalog: Catalog): ReportFinding[] {
  const codes = new Map(catalog.groups.flatMap(group => group.codes.map(rule => [rule.id, { group, rule }] as const)));
  return findings.map(finding => {
    const entry = finding.code ? codes.get(finding.code) : undefined;
    return {
      ...finding, rule: finding.rule ?? entry?.rule,
      groupName: entry?.group.name ?? (finding.code ? 'Other rules' : 'Comments'),
      groupColor: entry?.group.color ?? '#a6b4c4'
    };
  });
}

// Split paths and camelCase as well as prose so terms can match across fields.
const tokenize = (text: string) => text.replace(/([a-z\d])([A-Z])/g, '$1 $2').match(/[\p{L}\p{N}]+/gu) ?? [];

export function createReportSearch(findings: ReportFinding[]) {
  const search = new MiniSearch({
    fields: ['path', 'code', 'title', 'description', 'group', 'comment', 'replies', 'resolution'],
    tokenize,
    searchOptions: {
      combineWith: 'AND', prefix: true,
      fuzzy: term => term.length >= 4 && !/^(?:v)?\d+$/i.test(term) ? 0.2 : false,
      boost: { path: 3, code: 3, title: 2 }
    }
  });
  search.addAll(findings.map(finding => ({
    id: finding.id, path: finding.path, code: finding.code, title: finding.rule?.title,
    description: finding.rule?.description, group: finding.groupName, comment: finding.comment,
    replies: finding.replies?.map(reply => reply.comment).join(' '), resolution: finding.resolution
  })));
  return search;
}

export function groupReportFiles(findings: ReportFinding[], sort: ReportSort): ReportFile[] {
  const files = new Map<string, ReportFile>();
  for (const finding of findings) {
    let file = files.get(finding.path);
    if (!file) {
      file = { path: finding.path, findings: [], violations: 0, comments: 0, unresolvedComments: 0, unresolvedFindings: 0 };
      files.set(finding.path, file);
    }
    file.findings.push(finding);
    if (finding.code) {
      file.violations++;
      if (finding.status === 'open') file.unresolvedFindings++;
    }
    else {
      file.comments++;
      if (finding.status === 'open') file.unresolvedComments++;
    }
  }
  return [...files.values()].sort((a, b) => b[sort] - a[sort] || a.path.localeCompare(b.path));
}
