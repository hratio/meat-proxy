export type LetteringMap = { main: number[][]; alt: number[][] };

/** Affine map from normalized text coordinates to a triangle in the UV atlas. */
export function textTransform(triangle: number[], size: number) {
  const [u0, v0, x0, y0, u1, v1, x1, y1, u2, v2, x2, y2] = triangle;
  const du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0;
  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) < 1e-10) return;
  const a = ((x1 - x0) * dv2 - (x2 - x0) * dv1) / det * size;
  const c = ((x2 - x0) * du1 - (x1 - x0) * du2) / det * size;
  const b = ((y0 - y1) * dv2 - (y0 - y2) * dv1) / det * size;
  const d = ((y0 - y2) * du1 - (y0 - y1) * du2) / det * size;
  return [a, b, c, d, x0 * size - a * u0 - c * v0, (1 - y0) * size - b * u0 - d * v0] as const;
}

/** Paint the same letters across UV islands, with a tiny seam bleed for mipmaps. */
export function paintLetters(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, label: HTMLCanvasElement | OffscreenCanvas, triangles: number[][], size: number) {
  for (const triangle of triangles) {
    const matrix = textTransform(triangle, size);
    if (!matrix) continue;
    const corners = [0, 4, 8].map(i => [triangle[i + 2] * size, (1 - triangle[i + 3]) * size]);
    const cx = corners.reduce((sum, p) => sum + p[0], 0) / 3, cy = corners.reduce((sum, p) => sum + p[1], 0) / 3;
    ctx.save(); ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const [x, y] = corners[i], length = Math.hypot(x - cx, y - cy) || 1;
      const px = x + (x - cx) / length * .7, py = y + (y - cy) / length * .7;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.clip(); ctx.transform(...matrix);
    ctx.drawImage(label, 0, 0, 1, 1); ctx.restore();
  }
}
