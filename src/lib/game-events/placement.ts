export type Rect = { left: number; right: number; top: number; bottom: number };

/** All coordinates are viewport coordinates, including the visual viewport on zoom. */
export function transmissionPlacement(input: {
  viewport: Rect; diff: Rect; left: boolean; inset: number; gap: number;
  preferredWidth: number; height: number; bottom: number;
}) {
  const { viewport: v, diff, left, inset, gap, preferredWidth, height, bottom } = input;
  const start = left ? v.left + inset : Math.max(v.left + inset, diff.right + gap);
  const end = left ? Math.min(v.right - inset, diff.left - gap) : v.right - inset;
  const width = Math.max(0, Math.min(preferredWidth, end - start));
  const maxHeight = Math.max(0, v.bottom - bottom - v.top - inset);
  return {
    left: left ? end - width : start,
    top: Math.max(v.top + inset, v.bottom - bottom - Math.min(height, maxHeight)),
    width, maxHeight,
    compact: width < 380,
    fits: width >= 150 && maxHeight >= 100 && height <= maxHeight + 1
  };
}
