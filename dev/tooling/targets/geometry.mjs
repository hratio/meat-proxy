// Trace the visible silhouette and largest enclosed aperture for CSS extrusion.
function contour(mask, width, height) {
  const edges = new Map();
  const add = (x, y, X, Y) => edges.set(y * (width + 1) + x, Y * (width + 1) + X);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) {
    if (y === 0 || !mask[(y - 1) * width + x]) add(x, y, x + 1, y);
    if (x === width - 1 || !mask[y * width + x + 1]) add(x + 1, y, x + 1, y + 1);
    if (y === height - 1 || !mask[(y + 1) * width + x]) add(x + 1, y + 1, x, y + 1);
    if (x === 0 || !mask[y * width + x - 1]) add(x, y + 1, x, y);
  }
  let best = [], bestArea = 0;
  while (edges.size) {
    const start = edges.keys().next().value;
    let current = start;
    const points = [];
    do {
      points.push([current % (width + 1), Math.floor(current / (width + 1))]);
      const next = edges.get(current); edges.delete(current); current = next;
    } while (current !== undefined && current !== start);
    const area = Math.abs(points.reduce((sum, [x, y], index) => {
      const [X, Y] = points[(index + 1) % points.length]; return sum + x * Y - X * y;
    }, 0));
    if (area > bestArea) { best = points; bestArea = area; }
  }
  return best;
}

function simplify(points, epsilon) {
  const distance = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  function reduce(pts) {
    let max = 0, index = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distance(pts[i], pts[0], pts.at(-1));
      if (d > max) { max = d; index = i; }
    }
    return max > epsilon ? [...reduce(pts.slice(0, index + 1)).slice(0, -1), ...reduce(pts.slice(index))] : [pts[0], pts.at(-1)];
  }
  const middle = Math.floor(points.length / 2);
  return [...reduce(points.slice(0, middle + 1)).slice(0, -1), ...reduce([...points.slice(middle), points[0]]).slice(0, -1)];
}

export function traceArtworkContours(rgba, width, height, epsilon = 7) {
  const solid = Uint8Array.from({ length: width * height }, (_, i) => rgba[i * 4 + 3] >= 128 ? 1 : 0);
  const seen = new Uint8Array(solid.length), queue = new Int32Array(solid.length);
  let hole = [];
  for (let start = 0; start < solid.length; start++) if (!solid[start] && !seen[start]) {
    let head = 0, tail = 1, border = false;
    queue[0] = start; seen[start] = 1;
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      if (!x || !y || x === width - 1 || y === height - 1) border = true;
      for (const n of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (n >= 0 && !solid[n] && !seen[n]) { seen[n] = 1; queue[tail++] = n; }
      }
    }
    if (!border && tail > hole.length) hole = Array.from(queue.subarray(0, tail));
  }
  if (hole.length < width * height * .01) throw Error('The transparent check opening could not be found.');
  const holeMask = new Uint8Array(solid.length);
  for (const p of hole) holeMask[p] = 1;
  const coords = mask => simplify(contour(mask, width, height), epsilon).map(([x, y]) => [+(x / width * 100).toFixed(3), +(y / height * 100).toFixed(3)]);
  return { outline: coords(solid), carving: coords(holeMask) };
}
