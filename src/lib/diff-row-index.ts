import type { DiffRow } from './location';
import type { FindingRange } from './types';

export class DiffRowIndex {
  readonly additions = new Map<number, DiffRow>();
  readonly deletions = new Map<number, DiffRow>();
  private ordered: Record<FindingRange['side'], DiffRow[]> = { additions: [], deletions: [] };

  constructor(rows: DiffRow[]) {
    for (const row of rows) {
      for (const side of ['additions', 'deletions'] as const) {
        if (row[side] !== undefined) { this[side].set(row[side], row); this.ordered[side].push(row); }
      }
    }
  }

  private start(range: FindingRange) {
    const rows = this.ordered[range.side];
    let lo = 0, hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (rows[mid][range.side]! < range.start) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  has(ranges: FindingRange[]) {
    return ranges.some(range => {
      const row = this.ordered[range.side][this.start(range)];
      return row !== undefined && row[range.side]! <= range.end;
    });
  }

  covered(ranges: FindingRange[]) {
    const result = new Set<DiffRow>();
    for (const range of ranges) {
      const rows = this.ordered[range.side];
      for (let index = this.start(range); index < rows.length && rows[index][range.side]! <= range.end; index++) result.add(rows[index]);
    }
    return [...result].sort((a, b) => a.order - b.order);
  }
}
