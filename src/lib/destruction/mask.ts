/** One live SVG mask cuts through every background layer of the diff. It is
 * updated on damage/layout changes, never by the debris animation loop. */
import type { contourPaths } from './contours';

export function createHoleMask(surface: HTMLElement) {
  const document = surface.ownerDocument, ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('data-destruction-mask', '');
  svg.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden';
  const defs = document.createElementNS(ns, 'defs'), mask = document.createElementNS(ns, 'mask');
  mask.id = `destruction-${crypto.randomUUID()}`;
  mask.setAttribute('maskUnits', 'userSpaceOnUse'); mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
  mask.setAttribute('x', '0'); mask.setAttribute('y', '0'); mask.style.maskType = 'luminance';
  const paper = document.createElementNS(ns, 'rect'), holes = document.createElementNS(ns, 'path');
  paper.setAttribute('fill', 'white'); holes.setAttribute('fill', 'black');
  holes.setAttribute('fill-rule', 'evenodd');
  mask.append(paper, holes); defs.append(mask); svg.append(defs); surface.append(svg);

  // The rim is a sibling: masking the panel must not also erase its inner wall.
  // Paint only the perimeter and thin broken bevels. The center stays open.
  const rim = document.createElementNS(ns, 'svg');
  rim.setAttribute('aria-hidden', 'true'); rim.setAttribute('data-destruction-rim', '');
  rim.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:hidden;z-index:1';
  const rimDefs = document.createElementNS(ns, 'defs'), clip = document.createElementNS(ns, 'clipPath');
  clip.id = `${mask.id}-opening`; clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const opening = document.createElementNS(ns, 'path'); opening.setAttribute('clip-rule', 'evenodd');
  clip.append(opening); rimDefs.append(clip); rim.append(rimDefs);
  function stroke(color: string, width: number, opacity = 1, inside = false, offset = '') {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', String(width)); path.setAttribute('stroke-opacity', String(opacity));
    path.setAttribute('stroke-linejoin', 'round');
    if (inside) {
      const group = document.createElementNS(ns, 'g'); group.setAttribute('clip-path', `url("#${clip.id}")`);
      if (offset) path.setAttribute('transform', offset);
      group.append(path); rim.append(group);
    } else rim.append(path);
    return path;
  }
  function chips(color: string, opacity: number) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('fill', color); path.setAttribute('fill-opacity', String(opacity));
    path.setAttribute('clip-path', `url("#${clip.id}")`); rim.append(path);
    return path;
  }
  // Two narrow offset strokes approximate a soft contact shadow without a
  // full-surface SVG blur/filter or any animation-time raster work.
  const softShadow = stroke('#000', 7, .18, true, 'translate(1.5 2.5)');
  const contactShadow = stroke('#000', 3, .55, true, 'translate(1 1.5)');
  const fracturedPaint = stroke('#17201a', 3.5, .85);
  const material = stroke('#828778', 1.1, .45);
  const shadedChips = chips('#686654', .65), litChips = chips('#bcb095', .75);
  const darkEdge = stroke('#0b110e', 1.3, .95);
  const litEdge = stroke('#c2bfa7', .8, .65);
  surface.after(rim);
  const previous = surface.style.maskImage;
  let oldPath = '', width = 0, height = 0;
  return {
    update(paths: ReturnType<typeof contourPaths>, nextWidth: number, nextHeight: number) {
      if (nextWidth !== width || nextHeight !== height) {
        width = nextWidth; height = nextHeight;
        for (const node of [mask, paper, rim]) { node.setAttribute('width', String(width)); node.setAttribute('height', String(height)); }
      }
      const path = paths.cut;
      if (path === oldPath) return;
      oldPath = path; holes.setAttribute('d', path);
      for (const node of [opening, softShadow, contactShadow, fracturedPaint, material]) node.setAttribute('d', path);
      darkEdge.setAttribute('d', paths.shade); litEdge.setAttribute('d', paths.light);
      litChips.setAttribute('d', paths.chips); shadedChips.setAttribute('d', paths.darkChips);
      surface.style.maskImage = path ? `url("#${mask.id}")` : previous;
    },
    dispose() { surface.style.maskImage = previous; svg.remove(); rim.remove(); }
  };
}
