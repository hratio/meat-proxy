import type { Aim, Comparison, DiffFile, DiffLineCounts, Finding, FindingRange } from './types';

export function sameComparison(a?: Comparison, b?: Comparison) {
  return a?.base === b?.base && a?.head === b?.head;
}

export function projectRanges(ranges: FindingRange[], from?: Comparison, to?: Comparison): FindingRange[] {
  if (!from || !to) return !from && !to ? ranges : [];
  return normalizeRanges(ranges.flatMap(range => {
    const version = range.side === 'additions' ? from.head : from.base;
    const sameSide = range.side === 'additions' ? to.head : to.base;
    const otherSide = range.side === 'additions' ? to.base : to.head;
    if (version === sameSide) return [range];
    if (version === otherSide) return [{ ...range, side: range.side === 'additions' ? 'deletions' as const : 'additions' as const }];
    return [];
  }));
}

export function findingForFile(finding: Finding, file: DiffFile): Finding | undefined {
  if (finding.path !== file.path) return;
  if (!finding.ranges) return finding;
  const ranges = projectRanges(finding.ranges, finding.comparison, file.comparison);
  return ranges.length ? { ...finding, ranges } : undefined;
}

export type DiffRow = { order: number; additions?: number; deletions?: number };

export function diffRows(patch: string, lineCounts?: DiffLineCounts): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 1, newLine = 1, order = 0, inHunk = false;
  const contextUntil = (oldEnd: number, newEnd: number) => {
    while (oldLine < oldEnd && newLine < newEnd) rows.push({ order: order++, deletions: oldLine++, additions: newLine++ });
  };
  for (const line of patch.split('\n')) {
    const hunk = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      // Zero-length sides name the preceding line rather than the next line.
      const oldStart = Number(hunk[1]) + (hunk[2] === '0' ? 1 : 0);
      const newStart = Number(hunk[3]) + (hunk[4] === '0' ? 1 : 0);
      if (lineCounts) contextUntil(oldStart, newStart);
      else order++; // Partial hunks are not adjacent just because their previews touch.
      oldLine = oldStart; newLine = newStart; inHunk = true;
      continue;
    }
    if (!inHunk || ![' ', '+', '-'].includes(line[0])) continue;
    rows.push({ order: order++, ...(line[0] !== '+' ? { deletions: oldLine++ } : {}), ...(line[0] !== '-' ? { additions: newLine++ } : {}) });
  }
  if (lineCounts) contextUntil(lineCounts.deletions + 1, lineCounts.additions + 1);
  return rows;
}

export function rowInRanges(row: DiffRow, ranges: FindingRange[]) {
  return ranges.some(range => {
    const line = row[range.side];
    return line !== undefined && line >= range.start && line <= range.end;
  });
}

export function normalizeRanges(ranges: FindingRange[]): FindingRange[] {
  const merged: FindingRange[] = [];
  for (const range of ranges.map(range => ({ ...range })).sort((a, b) => a.side.localeCompare(b.side) || a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous?.side === range.side && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end);
    else merged.push(range);
  }
  return merged;
}

export function rangesForRows(rows: DiffRow[], bothSides = false): FindingRange[] {
  return normalizeRanges(rows.flatMap(row => {
    const ranges: FindingRange[] = [];
    if (row.additions !== undefined) ranges.push({ side: 'additions', start: row.additions, end: row.additions });
    if (row.deletions !== undefined && (bothSides || row.additions === undefined)) ranges.push({ side: 'deletions', start: row.deletions, end: row.deletions });
    return ranges;
  }));
}

export function aimedRows(rows: DiffRow[], aim: Aim, from?: Aim, endLine?: number) {
  if (aim.line === undefined || !aim.side) return [];
  if (from?.line !== undefined && from.side && from.path === aim.path) {
    const start = rows.findIndex(row => row[from.side!] === from.line);
    const end = rows.findIndex(row => row[aim.side!] === aim.line);
    if (start >= 0 && end >= 0) return rows.slice(Math.min(start, end), Math.max(start, end) + 1);
  }
  const range = { side: aim.side, start: Math.min(aim.line, endLine ?? aim.line), end: Math.max(aim.line, endLine ?? aim.line) };
  return rows.filter(row => rowInRanges(row, [range]));
}

export function subtractRanges(ranges: FindingRange[], cuts: FindingRange[]) {
  let remaining = ranges.map(range => ({ ...range }));
  for (const cut of cuts) {
    remaining = remaining.flatMap(range => {
      if (cut.side !== range.side || cut.start > range.end || cut.end < range.start) return [range];
      const pieces: FindingRange[] = [];
      if (range.start < cut.start) pieces.push({ ...range, end: cut.start - 1 });
      if (range.end > cut.end) pieces.push({ ...range, start: cut.end + 1 });
      return pieces;
    });
  }
  return normalizeRanges(remaining);
}

export function partitionRanges(rows: DiffRow[], ranges: FindingRange[]) {
  const marked = rows.filter(row => rowInRanges(row, ranges));
  const groups: DiffRow[][] = [];
  for (const row of marked) {
    const previous = groups.at(-1);
    if (previous?.at(-1)?.order === row.order - 1) previous.push(row);
    else groups.push([row]);
  }
  const result = groups.map(group => rangesForRows(group));
  // Live edits can hide original addresses. Erasing visible rows must keep those.
  const outside = subtractRanges(ranges, rangesForRows(marked, true));
  if (outside.length) {
    if (result.length) result[0] = normalizeRanges([...result[0], ...outside]);
    else result.push(outside);
  }
  return result;
}

export function hasLocation(files: DiffFile[], aim: Aim | Finding) {
  const file = files.find(f => f.path === aim.path);
  if (!file) return false;
  if ('id' in aim) {
    if (file.patchPending) return file.locatedFindings?.includes(aim.id) || false;
    const finding = findingForFile(aim, file);
    return !!finding && (!finding.ranges?.length || diffRows(file.patch, file.lineCounts).some(row => rowInRanges(row, finding.ranges!)));
  }
  return aim.line === undefined || aimedRows(diffRows(file.patch, file.lineCounts), aim).length > 0;
}

export function rangeLabel(finding: Pick<Finding, 'ranges'>, includeSide = false) {
  if (!finding.ranges?.length) return 'file';
  const mixed = new Set(finding.ranges.map(range => range.side)).size > 1;
  return finding.ranges.map(range => `${includeSide || mixed ? range.side === 'deletions' ? 'old ' : 'new ' : ''}${range.start}${range.end === range.start ? '' : `–${range.end}`}`).join(', ');
}
