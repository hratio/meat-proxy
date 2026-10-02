import { LineDamage, type DestructionHit, type FileDamage, type Interval, type ShotAim } from './model';
import { LineHoles } from './holes';
import { createHoleMask } from './mask';
import { contourPaths, holeContours, type HoleRect } from './contours';
import { createFracture, fractureSeed } from './fracture';

const highlights = new WeakMap<Document, { ink: Highlight; users: number }>();
const highlightName = 'pr-destruction';
export const supportsDestruction = () => typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && !!CSS.highlights;
type TextPart = { node: Text; start: number; end: number };
type Row = { key: string; element: HTMLElement; column: HTMLElement; text: string; parts?: TextPart[]; ranges: Range[] };
type Geometry = { row: Row; rect: DOMRect; clip: DOMRect };

/** Owns only paint ranges. Pierre remains the sole owner of the code DOM. */
export function createTextDestruction(root: ShadowRoot, damage: FileDamage, surface: HTMLElement) {
  const document = root.ownerDocument;
  let group = highlights.get(document);
  if (!group) { group = { ink: new Highlight(), users: 0 }; highlights.set(document, group); CSS.highlights.set(highlightName, group.ink); }
  group.users++;
  const ink = group.ink;
  const mask = createHoleMask(surface);
  let cell = 13 / 6, frame = 0;
  let rows = new Map<string, Row>();
  let styles = new WeakMap<Element, { font: string; color: string; size: number }>();
  const clear = (row: Row) => { for (const range of row.ranges) ink.delete(range); row.ranges = []; };
  function parts(row: Row) {
    if (row.parts) return row.parts;
    const result: TextPart[] = [], walker = document.createTreeWalker(row.element, NodeFilter.SHOW_TEXT);
    let start = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text, end = start + node.length;
      if (end > start) result.push({ node, start, end });
      start = end;
    }
    return row.parts = result;
  }
  function rangeFor(row: Row, interval: Interval) {
    const nodes = parts(row);
    const first = nodes.find(part => part.end > interval.start), last = nodes.find(part => part.end >= interval.end);
    if (!first || !last) return;
    const range = document.createRange();
    range.setStart(first.node, interval.start - first.start); range.setEnd(last.node, interval.end - last.start);
    return range;
  }
  function bind(row: Row, line?: LineDamage) {
    clear(row);
    if (!line || line.text !== row.text) return;
    for (const interval of line.intervals()) {
      const range = rangeFor(row, interval);
      if (range) { ink.add(range); row.ranges.push(range); }
    }
  }
  function refresh() {
    const next = new Map<string, Row>();
    styles = new WeakMap();
    cell = (parseFloat(getComputedStyle(surface).getPropertyValue('--pr-diff-font-size')) || 13) / 6;
    for (const element of root.querySelectorAll<HTMLElement>('[data-line]')) {
      const side = element.closest('[data-deletions]') || element.dataset.lineType === 'change-deletion' ? 'deletions' : 'additions';
      const key = `${side}:${element.dataset.line}`;
      const old = rows.get(key);
      const text = element.textContent || '';
      // Highlighting can replace text nodes while retaining the row element.
      if (old?.element === element && old.text === text && (!old.parts || old.parts.every(part => part.node.isConnected && element.contains(part.node)))) next.set(key, old);
      else {
        if (old) clear(old);
        const row: Row = { key, element, column: element.closest<HTMLElement>('[data-code]')!, text, ranges: [] };
        bind(row, damage.lines.get(key)); next.set(key, row);
      }
    }
    for (const [key, row] of rows) if (!next.has(key)) clear(row);
    rows = next;
    updateMask();
  }
  function geometry(damagedOnly = false): Geometry[] {
    const columns = new Map<HTMLElement, DOMRect>(), result: Geometry[] = [];
    for (const row of rows.values()) {
      if (!row.element.isConnected || damagedOnly && !damage.holes.has(row.key)) continue;
      let clip = columns.get(row.column);
      if (!clip) { clip = row.column.getBoundingClientRect(); columns.set(row.column, clip); }
      result.push({ row, clip, rect: row.element.getBoundingClientRect() });
    }
    return result;
  }
  function updateMask(layout = geometry(true)) {
    const box = surface.getBoundingClientRect();
    const rectangles: HoleRect[] = [];
    for (const { row, rect, clip } of layout) {
      const holes = damage.holes.get(row.key);
      if (holes) rectangles.push(...holes.rectangles(rect.left - box.left, rect.top - box.top, cell, rect.height,
        Math.max(rect.left, clip.left) - box.left, Math.min(rect.right, clip.right) - box.left));
    }
    mask.update(contourPaths(holeContours(rectangles)), box.width, box.height);
  }
  function scheduleMask() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; updateMask(); });
  }
  function offsetAt(row: Row, point: { x: number; y: number }) {
    const caret = document.caretPositionFromPoint?.(point.x, point.y, { shadowRoots: [root] });
    const part = caret && parts(row).find(part => part.node === caret.offsetNode);
    if (part && caret) return part.start + caret.offset;
    // Fallback also handles clicks beyond the text. Range measurements preserve
    // tabs, wide characters and token styles without assuming fixed cell widths.
    let low = 0, high = row.text.length;
    while (low < high) {
      const mid = (low + high) >>> 1, range = rangeFor(row, { start: mid, end: mid + 1 });
      if (!range || range.getBoundingClientRect().right < point.x) low = mid + 1; else high = mid;
    }
    return low;
  }
  function hit(aim: ShotAim, point: { x: number; y: number }, radius: number): DestructionHit {
    const result: DestructionHit = { contact: false, changed: false, fragments: [] };
    const fragments = result.fragments;
    const layout = geometry();
    const contact = layout.find(({ rect, clip }) => point.y >= Math.max(rect.top, clip.top)
      && point.y < Math.min(rect.bottom, clip.bottom) && point.x >= Math.max(rect.left, clip.left)
      && point.x < Math.min(rect.right, clip.right));
    result.contact = !!contact;
    const anchor = damage.combat?.hitbox === 'panel' ? contact
      : layout.find(({ row }) => row.key === `${aim.side || 'additions'}:${aim.line}`);
    if (!anchor) return result;
    // Content coordinates keep the break stable when the viewport or scroll
    // position moves. Nearby pointer subpixels share a seed, avoiding jitter.
    const seed = fractureSeed(`${damage.key}:${anchor.row.key}:${Math.round((point.x - anchor.rect.left) / (cell * 4))}:${Math.round((point.y - anchor.rect.top) / 4)}`);
    const fracture = createFracture(radius, seed);
    const changed: { row: Row; line: LineDamage }[] = [];
    for (const { row, rect, clip } of layout) {
      const dy = Math.max(rect.top - point.y, point.y - rect.bottom, 0);
      if (dy >= radius || point.x + radius < Math.max(rect.left, clip.left) || point.x - radius > Math.min(rect.right, clip.right)) continue;
      const holes = damage.holes.get(row.key) || new LineHoles();
      const cut = holes.cut(point.x - rect.left, point.y - rect.top, fracture, cell, rect.height,
        Math.min(rect.width, clip.right - rect.left), Math.max(0, clip.left - rect.left));
      if (!cut) continue;
      damage.holes.set(row.key, holes); result.changed = true;
      const middle = rect.top + rect.height / 2;
      if (!row.text) continue;
      let line = damage.lines.get(row.key);
      if (!line || line.text !== row.text) damage.lines.set(row.key, line = new LineDamage(row.text));
      const selected = [];
      // A splinter can clip a glyph's top/bottom without crossing the line's
      // center. Sample the text box, then merge spans before any caret queries.
      const inkBox = rangeFor(row, { start: 0, end: 1 })?.getBoundingClientRect() || rect;
      const spans = [inkBox.top + .5, (inkBox.top + inkBox.bottom) / 2, inkBox.bottom - .5]
        .flatMap(y => fracture.spansAt(y - point.y)).sort((a, b) => a.start - b.start);
      const merged: Interval[] = [];
      for (const span of spans) {
        const previous = merged.at(-1);
        if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end);
        else merged.push({ ...span });
      }
      for (const span of merged) {
        const left = Math.max(rect.left, clip.left, point.x + span.start), right = Math.min(rect.right, clip.right, point.x + span.end);
        if (right <= left) continue;
        const start = offsetAt(row, { x: left, y: middle }), end = Math.max(start + 1, offsetAt(row, { x: right, y: middle }));
        selected.push(...line.erase(start, end, Math.max(0, 96 - fragments.length - selected.length)));
      }
      changed.push({ row, line });
      // Bound fragment geometry and texture work across the whole blast. The
      // mask and text damage still cover every affected character.
      for (const glyph of selected) {
        const range = rangeFor(row, glyph);
        if (!range) continue;
        const rect = range.getBoundingClientRect(), parent = range.startContainer.parentElement!;
        if (!rect.width || !rect.height) continue;
        let style = styles.get(parent);
        if (!style) {
          const css = getComputedStyle(parent);
          style = { font: `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`, color: css.color, size: parseFloat(css.fontSize) };
          styles.set(parent, style);
        }
        fragments.push({ text: glyph.text, ...style, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
    }
    if (result.changed) updateMask(layout);
    for (const { row, line } of changed) bind(row, line);
    return result;
  }
  refresh();
  const observer = new ResizeObserver(scheduleMask); observer.observe(surface);
  root.addEventListener('scroll', scheduleMask, true);
  return {
    hit, refresh,
    dispose() {
      cancelAnimationFrame(frame); observer.disconnect(); root.removeEventListener('scroll', scheduleMask, true); mask.dispose();
      for (const row of rows.values()) clear(row);
      rows.clear();
      if (!--group.users) { CSS.highlights.delete(highlightName); highlights.delete(document); }
    }
  };
}
