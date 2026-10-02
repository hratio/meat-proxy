import type { Interval } from './model';

type Point = { x: number; y: number };
export type Fracture = { radius: number; points: Point[]; spansAt(y: number): Interval[] };

export function fractureSeed(value: string) {
  let seed = 2166136261;
  for (let i = 0; i < value.length; i++) seed = Math.imul(seed ^ value.charCodeAt(i), 16777619);
  return seed >>> 0;
}

/** An irregular, grain-biased break inside the weapon's radius. Its seed comes
 * from source coordinates, never the shot counter or animation time. */
export function createFracture(radius: number, seed: number): Fracture {
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const count = 19 + Math.floor(random() * 8), turn = Math.PI * 2;
  const grain = Math.PI / 2 + (random() - .5) * .7, narrow = .7 + random() * .17;
  const steps = Array.from({ length: count }, () => .55 + random());
  const total = steps.reduce((sum, step) => sum + step, 0);
  let angle = random() * turn;
  const points = steps.map(step => {
    const along = Math.cos(angle - grain), across = Math.sin(angle - grain);
    const envelope = 1 / Math.hypot(along, across / narrow);
    const chip = random();
    // Deep bites and isolated long splinters interrupt broader torn facets.
    const reach = chip < .23 ? .42 + random() * .15 : chip > .78 ? .93 + random() * .07 : .66 + random() * .19;
    const distance = radius * reach * envelope;
    const point = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
    angle += step / total * turn;
    return point;
  });
  // Two longer splits follow the panel grain. The surrounding random shoulders
  // make these narrow tears rather than a symmetrical starburst.
  for (const direction of [grain, grain + Math.PI]) {
    const reach = radius * (.96 + random() * .04);
    points.push({ x: Math.cos(direction) * reach, y: Math.sin(direction) * reach });
  }
  points.sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
  return {
    radius, points,
    spansAt(y: number) {
      if (Math.abs(y) >= radius) return [];
      const intersections: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if (a.y <= y && b.y > y || b.y <= y && a.y > y) intersections.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
      }
      intersections.sort((a, b) => a - b);
      const spans: Interval[] = [];
      for (let i = 0; i + 1 < intersections.length; i += 2) spans.push({ start: intersections[i], end: intersections[i + 1] });
      return spans;
    }
  };
}
