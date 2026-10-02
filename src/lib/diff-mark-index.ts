import type { DiffRow } from './location';

type Side = 'additions' | 'deletions';
const sides: Side[] = ['additions', 'deletions'];

// Cache visual row positions with the diff, not with each shot or hover.
// Split columns pair change blocks and leave a gap on the shorter side.
export class DiffMarkIndex {
  private split = new Map<DiffRow, number>();

  constructor(rows: readonly DiffRow[]) {
    let position = 0;
    for (let index = 0; index < rows.length;) {
      const row = rows[index];
      if (index && rows[index - 1].order + 1 !== row.order) position++;
      if (row.additions !== undefined && row.deletions !== undefined) {
        this.split.set(row, position++);
        index++;
        continue;
      }
      const count = { additions: 0, deletions: 0 };
      do {
        const changed = rows[index];
        const side = changed.additions === undefined ? 'deletions' : 'additions';
        this.split.set(changed, position + count[side]++);
        index++;
      } while (index < rows.length && rows[index - 1].order + 1 === rows[index].order
        && (rows[index].additions === undefined || rows[index].deletions === undefined));
      position += Math.max(count.additions, count.deletions);
    }
  }

  ranges(marked: ReadonlySet<DiffRow>, layout: 'unified' | 'split') {
    const positions = { additions: new Set<number>(), deletions: new Set<number>() };
    for (const row of marked) {
      for (const side of sides) {
        if (layout === 'unified' || row[side] !== undefined) positions[side].add(layout === 'unified' ? row.order : this.split.get(row)!);
      }
    }
    const result = new Map<DiffRow, Partial<Record<Side, string>>>();
    for (const row of marked) {
      const position = layout === 'unified' ? row.order : this.split.get(row)!;
      const edges: Partial<Record<Side, string>> = {};
      for (const side of sides) {
        if (row[side] === undefined) continue;
        edges[side] = [!positions[side].has(position - 1) && 'start', !positions[side].has(position + 1) && 'end'].filter(Boolean).join(' ');
      }
      result.set(row, edges);
    }
    return result;
  }
}
