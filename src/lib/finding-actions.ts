import type { Rule } from './config';
import type { Action, Change, DiffFile, Finding } from './types';
import { aimedRows, normalizeRanges, partitionRanges, projectRanges, rangesForRows, rowInRanges, sameComparison, subtractRanges, type DiffRow } from './location';

export type StrokeAction = Extract<Action, { type: 'shoot' | 'erase' }>;
type FindingAction = StrokeAction | Extract<Action, { type: 'comment' }>;
export type FindingChange = Extract<Change, { kind: 'finding' }>;

// The browser preview and persisted review use the same range/merge rules.
// A stroke's mutation ID also keeps newly created badges addressable before
// its acknowledgement arrives (including pieces created by erasing a range).
export function findingChanges(findings: Finding[], action: FindingAction, target: DiffFile, rows: DiffRow[], rule: Rule | undefined, at: string, newId: () => string): FindingChange[] {
  const changes: FindingChange[] = [];
  const mutationId = action.type !== 'comment' ? action.mutationId : undefined;
  if (action.type === 'erase') {
    const cuts = rangesForRows(aimedRows(rows, action.aim, action.from, action.endLine), true);
    for (const f of findings.filter(f => f.code && f.path === action.aim.path && f.status === 'open')) {
      if (action.aim.line === undefined && !f.ranges) changes.push({ kind: 'finding', id: f.id, before: f });
      else if (action.aim.line !== undefined && f.ranges) {
        const remaining = subtractRanges(f.ranges, projectRanges(cuts, target.comparison, f.comparison));
        if (JSON.stringify(remaining) === JSON.stringify(f.ranges)) continue;
        const pieces = (sameComparison(f.comparison, target.comparison) ? partitionRanges(rows, remaining) : remaining.length ? [remaining] : [])
          .map((ranges, index) => ({ ...f, id: index ? mutationId ? `${mutationId}:${f.id}:${index}` : newId() : f.id, ranges }));
        changes.push({ kind: 'finding', id: f.id, before: f, after: pieces[0] });
        for (const piece of pieces.slice(1)) changes.push({ kind: 'finding', id: piece.id, after: piece });
      }
    }
    return changes;
  }

  const hitRows = aimedRows(rows, action.aim, action.type === 'shoot' ? action.from : undefined, action.type === 'shoot' ? action.endLine : undefined);
  let ranges = action.aim.line === undefined ? undefined : rangesForRows(hitRows);
  const orders = new Set(hitRows.map(row => row.order));
  const joined: Finding[] = [];
  if (action.type === 'shoot') {
    // Adjacency follows displayed rows, including old/new side transitions.
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const f of findings) {
        if (joined.includes(f) || f.status !== 'open' || f.path !== action.aim.path || f.code !== action.code || !sameComparison(f.comparison, target.comparison)) continue;
        const candidateRows = f.ranges ? rows.filter(row => rowInRanges(row, f.ranges!)) : [];
        const touching = ranges && f.ranges
          ? candidateRows.some(row => orders.has(row.order) || orders.has(row.order - 1) || orders.has(row.order + 1))
          : !ranges && !f.ranges;
        if (!touching) continue;
        joined.push(f); expanded = true;
        if (ranges && f.ranges) {
          ranges = normalizeRanges([...ranges, ...f.ranges]);
          for (const row of candidateRows) orders.add(row.order);
        }
      }
    }
  }
  const first = joined[0];
  const finding: Finding = {
    path: action.aim.path, comparison: target.comparison, version: target.live?.version,
    ...(ranges ? { ranges } : {}), id: first?.id || mutationId || newId(), status: 'open', createdAt: first?.createdAt || at,
    ...(rule ? { code: rule.id, rule: structuredClone(first?.rule || rule) } : { comment: (action as Extract<Action, { type: 'comment' }>).comment.trim(), role: 'reviewer' })
  };
  if (!first || JSON.stringify(first.ranges) !== JSON.stringify(ranges) || joined.length > 1) {
    changes.push({ kind: 'finding', id: finding.id, before: first, after: finding });
    for (const f of joined.slice(1)) changes.push({ kind: 'finding', id: f.id, before: f });
  }
  return changes;
}

export function applyFindingChanges(findings: Finding[], changes: FindingChange[]): Finding[] {
  if (!changes.length) return findings;
  const changed = new Set(changes.map(change => change.id));
  return [...findings.filter(finding => !changed.has(finding.id)), ...changes.flatMap(change => change.after ? [change.after] : [])]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function mergeStroke(previous: StrokeAction, next: StrokeAction, rows: DiffRow[]): StrokeAction | undefined {
  if (!previous.strokeId || previous.strokeId !== next.strokeId || previous.type !== next.type
    || (previous.type === 'shoot' && next.type === 'shoot' && previous.code !== next.code)
    || previous.aim.path !== next.aim.path || previous.aim.revision !== next.aim.revision || !sameComparison(previous.aim.comparison, next.aim.comparison)
    || !next.from || next.from.path !== next.aim.path || next.from.revision !== next.aim.revision || !sameComparison(next.from.comparison, next.aim.comparison)
    || previous.aim.line === undefined || next.aim.line === undefined) return;
  const before = aimedRows(rows, previous.aim, previous.from, previous.endLine);
  const after = aimedRows(rows, next.aim, next.from, next.endLine);
  if (!before.length || !after.length || before[0].order > after.at(-1)!.order + 1 || after[0].order > before.at(-1)!.order + 1) return;
  const first = before[0].order < after[0].order ? before[0] : after[0];
  const last = before.at(-1)!.order > after.at(-1)!.order ? before.at(-1)! : after.at(-1)!;
  const aim = (row: DiffRow) => ({ ...next.aim, side: row.additions === undefined ? 'deletions' as const : 'additions' as const, line: row.additions ?? row.deletions! });
  // Keep both extremes when the pointer reverses; retaining only its newest
  // position would lose lines already crossed during this queued segment.
  return { ...previous, from: aim(first), aim: aim(last), endLine: undefined };
}
