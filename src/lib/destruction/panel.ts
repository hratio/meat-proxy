import type { DestructionHit, FileDamage, ShotAim } from './model';
import { LineHoles } from './holes';
import { createFracture, fractureSeed } from './fracture';
import { contourPaths, holeContours, type HoleRect } from './contours';
import { createHoleMask } from './mask';

// Unavailable previews still have a panel to break. Its sparse coverage lives in
// the same revision-bound damage state as text, without reading the source file.
const bandHeight = 24, cell = 2, prefix = 'panel:';
export function createPanelDestruction(surface: HTMLElement, damage: FileDamage) {
  const mask = createHoleMask(surface);
  let frame = 0;
  function render(box = surface.getBoundingClientRect()) {
    const rectangles: HoleRect[] = [];
    for (const [key, holes] of damage.holes) {
      if (!key.startsWith(prefix)) continue;
      const top = Number(key.slice(prefix.length)) * bandHeight;
      for (const rect of holes.rectangles(0, top, cell, bandHeight, 0, box.width)) {
        if (rect.top < box.height) rectangles.push({ ...rect, bottom: Math.min(rect.bottom, box.height) });
      }
    }
    mask.update(contourPaths(holeContours(rectangles)), box.width, box.height);
  }
  function hit(_aim: ShotAim, point: { x: number; y: number }, radius: number): DestructionHit {
    const result: DestructionHit = { contact: false, changed: false, fragments: [] };
    const box = surface.getBoundingClientRect(), x = point.x - box.left, y = point.y - box.top;
    if (x < 0 || y < 0 || x >= box.width || y >= box.height) return result;
    result.contact = true;
    const seed = fractureSeed(`${damage.key}:panel:${Math.round(x / 8)}:${Math.round(y / 4)}`);
    const fracture = createFracture(radius, seed);
    const first = Math.max(0, Math.floor((y - radius) / bandHeight));
    const last = Math.floor(Math.min(box.height - .01, y + radius) / bandHeight);
    for (let band = first; band <= last; band++) {
      const key = `${prefix}${band}`, holes = damage.holes.get(key) || new LineHoles();
      if (holes.cut(x, y - band * bandHeight, fracture, cell, bandHeight, box.width, 0, box.height - band * bandHeight)) {
        damage.holes.set(key, holes); result.changed = true;
      }
    }
    if (result.changed) {
      render(box);
      // Small material chips share the existing bounded debris pool.
      for (let i = 0; i < 8; i++) {
        const tip = fracture.points[i * 3 % fracture.points.length];
        result.fragments.push({ text: i % 2 ? '▪' : '▰', font: '12px monospace', color: i % 2 ? '#bcb095' : '#828778', size: 12,
          x: point.x + tip.x * .45, y: point.y + tip.y * .45 });
      }
    }
    return result;
  }
  render();
  const observer = new ResizeObserver(() => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
  });
  observer.observe(surface);
  return { hit, dispose() { cancelAnimationFrame(frame); observer.disconnect(); mask.dispose(); } };
}
