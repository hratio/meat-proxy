export type Rect = { left: number; top: number; width: number; height: number };
export type Placement = 'left' | 'right' | 'above' | 'below';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));

/** Keep both the instruction and its live target reachable, including after zoom/resize. */
export function placeTutorial(viewport: Rect, size: { width: number; height: number }, target?: Rect, preferred: Placement = 'right') {
  const inset = 12, gap = 20;
  const width = Math.min(size.width, viewport.width - inset * 2);
  const height = Math.min(size.height, viewport.height - inset * 2);
  const minX = viewport.left + inset, minY = viewport.top + inset;
  const maxX = viewport.left + viewport.width - inset - width, maxY = viewport.top + viewport.height - inset - height;
  if (!target) return { left: clamp(viewport.left + (viewport.width - width) / 2, minX, maxX), top: clamp(viewport.top + (viewport.height - height) / 2, minY, maxY), width, height };
  const middleX = target.left + target.width / 2, middleY = target.top + target.height / 2;
  const candidates = {
    right: { left: target.left + target.width + gap, top: clamp(middleY - height / 2, minY, maxY) },
    left: { left: target.left - width - gap, top: clamp(middleY - height / 2, minY, maxY) },
    above: { left: clamp(middleX - width / 2, minX, maxX), top: target.top - height - gap },
    below: { left: clamp(middleX - width / 2, minX, maxX), top: target.top + target.height + gap }
  };
  const order = [preferred, ...(['right', 'left', 'above', 'below'] as const).filter(side => side !== preferred)];
  for (const side of order) {
    const point = candidates[side];
    if (point.left >= minX && point.left <= maxX && point.top >= minY && point.top <= maxY) return { ...point, width, height };
  }
  // Small screens may have no adjacent space. Use the corner with least overlap.
  const corners = [{ left: minX, top: minY }, { left: maxX, top: minY }, { left: minX, top: maxY }, { left: maxX, top: maxY }];
  const overlap = (point: typeof corners[number]) => Math.max(0, Math.min(point.left + width, target.left + target.width) - Math.max(point.left, target.left))
    * Math.max(0, Math.min(point.top + height, target.top + target.height) - Math.max(point.top, target.top));
  corners.sort((a, b) => overlap(a) - overlap(b));
  return { ...corners[0], width, height };
}
