// Pagination sized to the available space. The latest (Live) round is always
// retained; the first and current rounds take priority over their neighbours.
export function revisionWindow(buttonWidths: readonly number[], current: number, width: number): (number | null)[] {
  const count = buttonWidths.length;
  if (!count) return [];
  const tokens = (indices: Set<number>) => [...indices].sort((a, b) => a - b).flatMap((index, position, ordered) =>
    position && index > ordered[position - 1] + 1 ? [null, index] : [index]);
  const fits = (items: (number | null)[]) => items.reduce<number>((sum, item) => sum + (item === null ? 18 : buttonWidths[item]), Math.max(0, items.length - 1) * 4) <= width;
  const all = Array.from({ length: count }, (_, index) => index);
  if (fits(all)) return all;
  const selected = new Set([count - 1]);
  const add = (index: number) => {
    if (index < 0 || index >= count || selected.has(index)) return;
    const next = new Set([...selected, index]);
    if (fits(tokens(next))) selected.add(index);
  };
  add(0);
  const focus = Math.max(0, Math.min(current, count - 1));
  add(focus);
  const minimumWidth = Math.max(1, Math.min(...buttonWidths));
  for (let offset = 1; offset <= Math.min(count, Math.ceil(width / minimumWidth)); offset++) {
    add(focus - offset); add(focus + offset); add(offset); add(count - 1 - offset);
  }
  return tokens(selected);
}
