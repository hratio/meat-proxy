type Point = { x: number; y: number };
type Sample = Point & { time: number };
// Three broad sweeps joined by rounded U-turns, matching the authored gesture.
const curves = [
  [[.04, .10], [.30, .15], [.55, .10], [.80, .10]],
  [[.80, .10], [1.02, .10], [1.02, .42], [.80, .42]],
  [[.80, .42], [.60, .42], [.38, .50], [.20, .50]],
  [[.20, .50], [-.02, .50], [-.02, .92], [.20, .92]],
  [[.20, .92], [.43, .92], [.67, .96], [.94, .96]]
];
let cached: { width: number; height: number; samples: Sample[] } | undefined;

/** Distance-based sampling keeps velocity continuous across curve joins. The
 * turns smoothly slow to 45% speed, then accelerate back onto each straight. */
export function introductionPath(progress: number, width: number, height: number): Point {
  if (!cached || cached.width !== width || cached.height !== height) {
    const samples: Sample[] = [];
    curves.forEach((curve, index) => {
      for (let step = 0; step <= 48; step++) {
        const t = step / 48, u = 1 - t;
        const weights = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3];
        const x = width * curve.reduce((sum, p, i) => sum + p[0] * weights[i], 0);
        const y = height * curve.reduce((sum, p, i) => sum + p[1] * weights[i], 0);
        const speed = index === 1 || index === 3 ? 1 - .55 * Math.sin(Math.PI * t) ** 2 : 1;
        const previous = samples.at(-1);
        const time = previous ? previous.time + Math.hypot(x - previous.x, y - previous.y) / speed : 0;
        if (!previous || time > previous.time) samples.push({ x, y, time });
      }
    });
    cached = { width, height, samples };
  }
  const samples = cached.samples, time = Math.max(0, Math.min(1, progress)) * samples.at(-1)!.time;
  let low = 1, high = samples.length - 1;
  while (low < high) { const mid = (low + high) >>> 1; if (samples[mid].time < time) low = mid + 1; else high = mid; }
  const a = samples[low - 1], b = samples[low], t = (time - a.time) / (b.time - a.time);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The visible code panel is the hitbox, including blank space and old holes.
 * Freeze its bounds for each burst: the entering HUD can change its clearance
 * during playback, but must not move the authored trajectory under the cursor. */
export function createIntroductionAim() {
  let bounds: { left: number; top: number; width: number; height: number } | undefined;
  return (section: HTMLElement | undefined, progress: number, ceiling: number, floor: number) => {
    if (!bounds || progress === 0) {
      const root = section?.querySelector('diffs-container')?.shadowRoot;
      if (!root || !section) return;
      const rows = [...root.querySelectorAll<HTMLElement>('[data-line]')].filter(row => {
        const box = row.getBoundingClientRect();
        return box.top >= ceiling && box.bottom < floor && box.width > 0;
      });
      const first = rows[0], last = rows.at(-1);
      if (!first || !last) return;
      const column = first.closest('[data-code]')?.getBoundingClientRect();
      if (!column) return;
      const box = section.getBoundingClientRect(), row = first.getBoundingClientRect();
      const left = Math.max(0, box.left, column.left, row.left) + 12;
      const right = Math.min(innerWidth, box.right, column.right, row.right) - 12;
      const top = row.top + 4, bottom = last.getBoundingClientRect().bottom - 4;
      if (right <= left || bottom <= top) return;
      bounds = { left, top, width: right - left, height: bottom - top };
    }
    const point = introductionPath(progress, bounds.width, bounds.height);
    return { x: bounds.left + point.x, y: bounds.top + point.y };
  };
}
