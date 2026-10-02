// File sections stay in document order even when collapsed or represented by
// placeholders. Find the first section below the toolbar in logarithmic reads.
export function fileAtScrollPosition(files: readonly { path: string }[], bottom: (path: string) => number | undefined, anchor: number) {
  let lo = 0, hi = files.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const edge = bottom(files[mid].path);
    if (edge === undefined) return; // The keyed list is currently being replaced.
    if (edge > anchor) hi = mid;
    else lo = mid + 1;
  }
  return files[lo]?.path;
}
