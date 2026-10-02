import { createPointerIntent, pointerIntentDefaults, type IntentBounds, type PointerIntentOptions, type PointerIntentState, type PointerSample } from './pointer-intent';

type Options = Partial<PointerIntentOptions> & { disabled?: boolean; onChange: (state: PointerIntentState) => void };
type Entry = {
  node: HTMLElement; options: Options; tracker: ReturnType<typeof createPointerIntent>;
  bounds?: IntentBounds; measuredAt: number; emitted: PointerIntentState;
};
type Sample = PointerSample & { path: EventTarget[] };
const entries = new Map<HTMLElement, Entry>(), visible = new Set<Entry>();
let observer: IntersectionObserver | undefined, resize: ResizeObserver | undefined;
let latest: Sample | undefined, frame = 0, idleTimer: ReturnType<typeof setTimeout> | undefined;

function emit(entry: Entry, state: PointerIntentState) {
  const previous = entry.emitted;
  if (state.active === previous.active && state.inside === previous.inside && state.near === previous.near) return;
  entry.emitted = state;
  entry.options.onChange(state);
}
function bounds(entry: Entry, now: number) {
  if (!entry.bounds || now - entry.measuredAt > 120) {
    entry.bounds = entry.node.getBoundingClientRect(); entry.measuredAt = now;
  }
  return entry.bounds;
}
function disabled(entry: Entry) { return entry.options.disabled || entry.node.matches(':disabled') || !!entry.node.closest('[inert]'); }
function reset() {
  latest = undefined; cancelAnimationFrame(frame); frame = 0; clearTimeout(idleTimer);
  for (const entry of visible) { entry.bounds = undefined; emit(entry, entry.tracker.reset()); }
}
function flush() {
  frame = 0;
  if (!latest || !visible.size) return;
  const sample = latest;
  // Read geometry before callbacks can change presentation. Offscreen targets
  // have no sampling or layout work; all mounted consumers share one listener.
  const measurements = [...visible].map(entry => ({ entry, rect: disabled(entry) ? undefined : bounds(entry, sample.time) }));
  for (const { entry, rect } of measurements) {
    emit(entry, rect ? entry.tracker.sample(sample, rect, sample.path.includes(entry.node)) : entry.tracker.reset());
  }
  clearTimeout(idleTimer);
  const expire = () => {
    let next = Infinity;
    const elapsed = performance.now() - sample.time;
    for (const entry of visible) {
      if (entry.tracker.state.inside) continue;
      const remaining = entry.tracker.tuning.idleMs - elapsed;
      if (remaining <= 0) emit(entry, entry.tracker.idle());
      else next = Math.min(next, remaining);
    }
    if (next !== Infinity) idleTimer = setTimeout(expire, Math.ceil(next));
  };
  idleTimer = setTimeout(expire, Math.min(...[...visible].map(entry => entry.tracker.tuning.idleMs)));
}
function move(event: PointerEvent) {
  if (event.pointerType === 'touch' || event.buttons || !event.isPrimary) { reset(); return; }
  latest = { x: event.clientX, y: event.clientY, time: performance.now(), path: event.composedPath() };
  if (!frame && visible.size) frame = requestAnimationFrame(flush);
}
function exit(event: PointerEvent) { if (!event.relatedTarget) reset(); }
function visibility() { if (document.hidden) reset(); }
function listen() {
  observer = new IntersectionObserver(changes => {
    for (const change of changes) {
      const entry = entries.get(change.target as HTMLElement);
      if (!entry) continue;
      entry.bounds = undefined;
      if (change.isIntersecting) visible.add(entry);
      else { visible.delete(entry); emit(entry, entry.tracker.reset()); }
    }
  });
  resize = new ResizeObserver(changes => { for (const change of changes) { const entry = entries.get(change.target as HTMLElement); if (entry) { entry.bounds = undefined; emit(entry, entry.tracker.reset()); } } });
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerout', exit, { passive: true });
  window.addEventListener('pointercancel', reset, { passive: true });
  window.addEventListener('blur', reset);
  window.addEventListener('scroll', reset, { passive: true, capture: true });
  window.addEventListener('resize', reset, { passive: true });
  document.addEventListener('visibilitychange', visibility);
}
function unlisten() {
  reset(); observer?.disconnect(); resize?.disconnect(); observer = undefined; resize = undefined;
  window.removeEventListener('pointermove', move); window.removeEventListener('pointerout', exit); window.removeEventListener('pointercancel', reset);
  window.removeEventListener('blur', reset); window.removeEventListener('scroll', reset, true); window.removeEventListener('resize', reset);
  document.removeEventListener('visibilitychange', visibility);
}

/** Svelte action: immediate real hover plus sampled intent inside a nearby circle. */
export function pointerIntent(node: HTMLElement, options: Options) {
  const entry: Entry = { node, options, tracker: createPointerIntent(options), emitted: { near: false, inside: false, active: false, confidence: 0 }, measuredAt: 0 };
  if (!entries.size) listen();
  entries.set(node, entry); observer!.observe(node); resize!.observe(node);
  const hover = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || event.buttons || disabled(entry)) return;
    const time = performance.now();
    emit(entry, entry.tracker.sample({ x: event.clientX, y: event.clientY, time }, bounds(entry, time), event.type === 'pointerenter'));
  };
  node.addEventListener('pointerenter', hover); node.addEventListener('pointerleave', hover);
  return {
    update(next: Options) {
      const changed = Object.keys(pointerIntentDefaults).some(key => entry.options[key as keyof PointerIntentOptions] !== next[key as keyof PointerIntentOptions]) || entry.options.disabled !== next.disabled;
      entry.options = next;
      if (changed) { emit(entry, entry.tracker.reset()); entry.tracker = createPointerIntent(next); entry.bounds = undefined; }
    },
    destroy() {
      emit(entry, entry.tracker.reset()); entries.delete(node); visible.delete(entry);
      observer?.unobserve(node); resize?.unobserve(node);
      node.removeEventListener('pointerenter', hover); node.removeEventListener('pointerleave', hover);
      if (!entries.size) unlisten();
    },
  };
}
