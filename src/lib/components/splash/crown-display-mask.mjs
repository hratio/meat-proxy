/** Exact authored lettering and glow used by both the asset build and legacy GLBs.
 * @param {import('three').BufferGeometry} geometry */
export function bakeCrownDisplayMask(geometry) {
  const width = 2048, height = 128, mask = new Float32Array(width * height);
  const position = geometry.getAttribute('position'), role = geometry.getAttribute('uv'), flow = geometry.getAttribute('uv1');
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < position.count; i++) if (Math.round((1 - role.getY(i)) * 8) === 10) {
    low = Math.min(low, position.getY(i)); high = Math.max(high, position.getY(i));
  }
  const index = geometry.index, count = index?.count ?? position.count;
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
    if (Math.round((1 - role.getY(ids[0])) * 8) !== 11) continue;
    const points = ids.map(id => [flow.getX(id), (position.getY(id) - low) / (high - low) * height]);
    if (Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])) > .5) for (const p of points) if (p[0] < .5) p[0]++;
    for (const p of points) p[0] *= width;
    const [a, b, c] = points;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < .001) continue;
    const x0 = Math.floor(Math.min(a[0], b[0], c[0])), x1 = Math.ceil(Math.max(a[0], b[0], c[0]));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = ((b[0] - x - .5) * (c[1] - y - .5) - (b[1] - y - .5) * (c[0] - x - .5)) / area;
      const v = ((c[0] - x - .5) * (a[1] - y - .5) - (c[1] - y - .5) * (a[0] - x - .5)) / area;
      if (u >= 0 && v >= 0 && u + v <= 1) mask[y * width + (x % width + width) % width] = 1;
    }
  }
  let pixels = mask;
  for (const radius of [12, 8, 12, 8]) {
    const horizontal = radius === 12, blurred = new Float32Array(mask.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const row = horizontal ? y : y + offset, column = horizontal ? (x + offset + width) % width : x;
        if (row >= 0 && row < height) sum += pixels[row * width + column];
      }
      blurred[y * width + x] = sum / (radius * 2 + 1);
    }
    pixels = blurred;
  }
  const data=new Uint8Array(width*height*2);
  for(let i=0;i<mask.length;i++){data[i*2]=Math.round(mask[i]*255);data[i*2+1]=Math.round(pixels[i]*255);}
  return { data, width, height };
}
