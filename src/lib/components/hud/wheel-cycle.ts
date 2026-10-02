import { on } from 'svelte/events';

/** Cycle one item per wheel tick, accumulating fine trackpad movement. */
export function wheelCycle(node: HTMLElement, cycle?: (direction: number) => void) {
  let distance = 0, lastAt = -Infinity;
  const destroy = on(node, 'wheel', event => {
    if (!cycle || event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault(); event.stopPropagation();
    const now = performance.now();
    if (now - lastAt > 200 || Math.sign(distance) !== Math.sign(event.deltaY)) distance = 0;
    lastAt = now;
    distance += event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : Math.sign(event.deltaY) * 40;
    if (Math.abs(distance) < 40) return;
    const direction = Math.sign(distance); distance = 0;
    cycle(direction);
  }, { passive: false });
  return { destroy, update(next?: (direction: number) => void) { cycle = next; } };
}
