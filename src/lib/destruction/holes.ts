import type { Interval } from './model';
import type { HoleRect } from './contours';
import type { Fracture } from './fracture';

// A sparse coverage grid, not a list of bullets. Overlapping shots merge into
// runs, so shooting an already destroyed area cannot accumulate more stamps.
export const holeSlices = 12;
export class LineHoles {
  readonly rows: Interval[][] = Array.from({ length: holeSlices }, () => []);

  cut(x: number, y: number, fracture: Fracture, cell: number, height: number, width: number, left = 0, bottom = height) {
    const slice = height / holeSlices;
    let changed = false;
    for (let i = 0; i < holeSlices; i++) {
      if ((i + .5) * slice >= bottom) continue;
      const cuts = fracture.spansAt((i + .5) * slice - y).map(span => ({
        start: Math.max(Math.floor(left / cell), Math.floor((x + span.start) / cell)),
        end: Math.min(Math.ceil(width / cell), Math.ceil((x + span.end) / cell))
      })).filter(span => span.end > span.start && !this.rows[i].some(run => run.start <= span.start && run.end >= span.end));
      if (!cuts.length) continue;
      const merged: Interval[] = [];
      for (const range of [...this.rows[i], ...cuts].sort((a, b) => a.start - b.start)) {
        const previous = merged.at(-1);
        if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
        else merged.push({ ...range });
      }
      this.rows[i] = merged;
      changed = true;
    }
    return changed;
  }

  rectangles(x: number, y: number, cell: number, height: number, left: number, right: number): HoleRect[] {
    const rectangles: HoleRect[] = [];
    for (let i = 0; i < holeSlices; i++) for (const run of this.rows[i]) {
      const start = Math.max(left, x + run.start * cell), end = Math.min(right, x + run.end * cell);
      if (end <= start) continue;
      const top = y + i * height / holeSlices, bottom = y + (i + 1) * height / holeSlices;
      rectangles.push({ left: start, top, right: end, bottom });
    }
    return rectangles;
  }
}

type RadiusProfile = { destructionRadiusPx: number; effect: string; chargeSize: number };
export function destructionRadius(profile: RadiusProfile, size: number, weight: number, charge: number) {
  const charged = profile.effect === 'plasma' ? 1 + Math.max(0, Math.min(1, charge)) * (profile.chargeSize - 1) : 1;
  return Math.min(240, Math.max(2, profile.destructionRadiusPx * size * Math.sqrt(weight) * charged));
}
