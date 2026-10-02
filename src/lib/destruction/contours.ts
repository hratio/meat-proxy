export type HoleRect = { left: number; top: number; right: number; bottom: number };
type Point = { x: number; y: number };
type Edge = { a: Point; b: Point; direction: number; used?: boolean };
type Events = Map<number, Map<number, number>>;
const n = (value: number) => Math.round(value * 100) / 100;
const key = (point: Point) => `${point.x},${point.y}`;

/** Trace the exposed perimeter of non-overlapping coverage cells. Shared edges cancel, so
 * joined blasts have one rim and surviving islands keep their own boundary. */
export function holeContours(rectangles: HoleRect[], tolerance = 1.6): Point[][] {
  const horizontal: Events = new Map(), vertical: Events = new Map();
  function add(map: Events, axis: number, start: number, end: number, sign: number) {
    axis = n(axis); start = n(start); end = n(end);
    let events = map.get(axis);
    if (!events) map.set(axis, events = new Map());
    events.set(start, (events.get(start) || 0) + sign);
    events.set(end, (events.get(end) || 0) - sign);
  }
  for (const { left, top, right, bottom } of rectangles) {
    if (right <= left || bottom <= top) continue;
    add(horizontal, top, left, right, 1); add(horizontal, bottom, left, right, -1);
    add(vertical, right, top, bottom, 1); add(vertical, left, top, bottom, -1);
  }
  const edges: Edge[] = [], starts = new Map<string, Edge[]>();
  function sweep(map: Events, isHorizontal: boolean) {
    for (const [axis, events] of map) {
      const positions = [...events.keys()].sort((a, b) => a - b);
      let winding = 0;
      for (let i = 0; i < positions.length - 1; i++) {
        const start = positions[i], end = positions[i + 1];
        winding += events.get(start)!;
        if (!winding || end <= start) continue;
        const a = isHorizontal ? { x: start, y: axis } : { x: axis, y: start };
        const b = isHorizontal ? { x: end, y: axis } : { x: axis, y: end };
        const edge: Edge = { a: winding > 0 ? a : b, b: winding > 0 ? b : a,
          direction: isHorizontal ? winding > 0 ? 0 : 2 : winding > 0 ? 1 : 3 };
        edges.push(edge);
        const at = key(edge.a), outgoing = starts.get(at);
        if (outgoing) outgoing.push(edge); else starts.set(at, [edge]);
      }
    }
  }
  sweep(horizontal, true); sweep(vertical, false);
  const loops: Point[][] = [];
  for (const first of edges) {
    if (first.used) continue;
    const points: Point[] = [];
    let edge: Edge | undefined = first;
    while (edge && !edge.used) {
      edge.used = true; points.push(edge.a);
      if (key(edge.b) === key(first.a)) break;
      const direction: number = edge.direction;
      // Keep diagonal point contacts as separate openings. Interior is right.
      const rank = (candidate: Edge) => [1, 0, 3, 2].indexOf((candidate.direction - direction + 4) % 4);
      edge = starts.get(key(edge.b))?.filter(candidate => !candidate.used).sort((a, b) => rank(a) - rank(b))[0];
    }
    if (points.length >= 3) loops.push(simplifyLoop(points, tolerance));
  }
  return loops;
}

function simplifyLoop(points: Point[], tolerance: number) {
  const corners = points.filter((point, i) => {
    const before = points[(i + points.length - 1) % points.length], after = points[(i + 1) % points.length];
    return (point.x - before.x) * (after.y - point.y) !== (point.y - before.y) * (after.x - point.x);
  });
  if (!tolerance || corners.length <= 4) return corners;
  let split = 1, farthest = 0;
  for (let i = 1; i < corners.length; i++) {
    const distance = (corners[i].x - corners[0].x) ** 2 + (corners[i].y - corners[0].y) ** 2;
    if (distance > farthest) { farthest = distance; split = i; }
  }
  // Simplify two open chains rather than a closed chain with coincident ends.
  return [...simplify(corners.slice(0, split + 1), tolerance).slice(0, -1),
    ...simplify([...corners.slice(split), corners[0]], tolerance).slice(0, -1)];
}

function simplify(points: Point[], tolerance: number) {
  const keep = new Set([0, points.length - 1]), pending = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop()!, a = points[first], b = points[last];
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    let distance = tolerance * tolerance, at = -1;
    for (let i = first + 1; i < last; i++) {
      const point = points[i], t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
      const squared = (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
      if (squared > distance) { distance = squared; at = i; }
    }
    if (at >= 0) { keep.add(at); pending.push([first, at], [at, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(index => points[index]);
}

export function contourPaths(contours: Point[][]) {
  let cut = '', light = '', shade = '', chips = '', darkChips = '';
  for (const points of contours) {
    cut += `M${points.map(point => `${point.x} ${point.y}`).join('L')}Z`;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      const segment = `M${a.x} ${a.y}L${b.x} ${b.y}`;
      // Light comes from above-left; the inward-facing lower/right wall catches it.
      const lit = dy * .6 - dx * .8 > 0;
      if (!lit) shade += segment;
      if (length < 2) continue;
      // Derive the bevel from edge direction/length, so scrolling translates it
      // intact instead of re-rolling bright chips along the opening.
      let seed = Math.imul(Math.round(dx * 100), 73856093) ^ Math.imul(Math.round(dy * 100), 19349663);
      seed = Math.imul(seed ^ seed >>> 16, 2246822507);
      const variation = (seed >>> 0) / 2 ** 32;
      const start = .08 + variation * .2, end = .7 + variation * .25, middle = .35 + variation * .3;
      const depth = Math.min(length * .28, .7 + variation * 2.7);
      const from = `${n(a.x + dx * start)} ${n(a.y + dy * start)}`;
      const to = `${n(a.x + dx * end)} ${n(a.y + dy * end)}`;
      const tip = `${n(a.x + dx * middle - dy / length * depth)} ${n(a.y + dy * middle + dx / length * depth)}`;
      const chip = `M${from}L${tip}L${to}Z`;
      if (lit) { light += `M${from}L${to}`; chips += chip; }
      else darkChips += chip;
    }
  }
  return { cut, light, shade, chips, darkChips };
}
