import type { LineHoles } from './holes';

/** Damage is stored in text coordinates, independently of virtualized DOM rows. */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export type Glyph = { text: string; start: number; end: number };
export type Interval = { start: number; end: number };

export class LineDamage {
  readonly text: string;
  private segments: Intl.Segments;
  private ranges: Interval[] = [];
  exhausted: boolean;
  constructor(text: string) {
    this.text = text;
    this.segments = segmenter.segment(text);
    this.exhausted = !/\S/u.test(text);
  }

  private destroyed(offset: number) {
    let low = 0, high = this.ranges.length;
    while (low < high) { const mid = (low + high) >>> 1; if (this.ranges[mid].end <= offset) low = mid + 1; else high = mid; }
    const range = this.ranges[low];
    return range && range.start <= offset ? range : undefined;
  }

  intervals(): readonly Interval[] { return this.ranges; }

  /** Remove an exact spatially selected range; cap debris, not the damage. */
  erase(start: number, end: number, limit: number): Glyph[] {
    if (end <= start || this.exhausted) return [];
    const first = this.segments.containing(Math.max(0, start));
    const last = this.segments.containing(Math.min(this.text.length - 1, end - 1));
    if (!first || !last) return [];
    start = first.index; end = last.index + last.segment.length;
    const glyphs: Glyph[] = [];
    for (let offset = start, inspected = 0; offset < end && glyphs.length < limit && inspected++ < 512;) {
      const old = this.destroyed(offset);
      if (old) { offset = old.end; continue; }
      const part = this.segments.containing(offset)!;
      const next = part.index + part.segment.length;
      if (/\S/u.test(part.segment)) glyphs.push({ text: part.segment, start: part.index, end: next });
      offset = next;
    }
    const merged: Interval[] = [];
    for (const range of [...this.ranges, { start, end }].sort((a, b) => a.start - b.start)) {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({ ...range });
    }
    this.ranges = merged;
    this.exhausted = merged.length === 1 && merged[0].start === 0 && merged[0].end === this.text.length;
    return glyphs;
  }
}

export type DestructionFile = {
  path: string; revision: string; comparison?: { base: string; head: string; kind?: string };
};
export function destructionKey(file: DestructionFile) {
  return JSON.stringify([file.path, file.revision, file.comparison?.base, file.comparison?.head]);
}
/** Temporary combat tuning belongs to the target, never the saved loadout. */
export type DestructionCombat = { health: number; damagePerHit: number; hitbox: 'panel' };
export type FileDamage = {
  key: string; sourceKey: string; path: string; shots: number; damage: number; finished: boolean;
  combat?: DestructionCombat; lines: Map<string, LineDamage>; holes: Map<string, LineHoles>;
};

/** Each future effect receives the same accepted shot and completion progress. */
export type CharacterFragment = { text: string; font: string; color: string; x: number; y: number; size: number };
export type DestructionShot = {
  path: string; key: string; shots: number; progress: number; complete: boolean;
  point: { x: number; y: number }; weapon: string; effect: string; charge: number; radius: number;
  fragments: CharacterFragment[];
};
export type ShotAim = { line?: number; side?: 'additions' | 'deletions' };
export type DestructionHit = { contact: boolean; changed: boolean; fragments: CharacterFragment[] };
export type DestructionSurface = { hit(aim: ShotAim, point: { x: number; y: number }, radius: number): DestructionHit };

export class DestructionController {
  global = false;
  get active() { return this.global || this.files.size > 0; }
  private session = '';
  private available = new Map<string, DestructionFile>();
  private files = new Map<string, FileDamage>();
  private excluded = new Set<string>();
  private views = new Map<string, DestructionFile>();
  private listeners = new Map<string, Set<() => void>>();
  private effects = new Set<(shot: DestructionShot) => void>();
  private surfaces = new Map<string, DestructionSurface>();

  private notify(path: string) { for (const callback of this.listeners.get(path) || []) callback(); }
  private arm(file: DestructionFile, combat?: DestructionCombat) {
    this.files.set(file.path, { key: destructionKey(file), sourceKey: destructionKey(this.available.get(file.path) || file), path: file.path, shots: 0, damage: 0, finished: false, combat, lines: new Map(), holes: new Map() });
    this.notify(file.path);
  }
  target(file: DestructionFile | undefined) {
    if (!file || file.comparison?.kind === 'history') return;
    const state = this.files.get(file.path);
    return state?.key === destructionKey(file) ? state : undefined;
  }
  subscribe(path: string, callback: () => void) {
    let listeners = this.listeners.get(path);
    if (!listeners) this.listeners.set(path, listeners = new Set());
    listeners.add(callback); callback();
    return () => { listeners.delete(callback); if (!listeners.size) this.listeners.delete(path); };
  }
  addEffect(callback: (shot: DestructionShot) => void) { this.effects.add(callback); return () => { this.effects.delete(callback); }; }
  surface(key: string, surface: DestructionSurface) {
    this.surfaces.set(key, surface);
    return () => { if (this.surfaces.get(key) === surface) this.surfaces.delete(key); };
  }
  reset() {
    const paths = [...this.files.keys()];
    this.global = false; this.files.clear(); this.excluded.clear();
    for (const path of paths) this.notify(path);
  }
  /** Returns true when held input must be cancelled after a content/session change. */
  sync(session: string, files: DestructionFile[], reviewed: Record<string, string>) {
    let changed = false;
    if (this.session !== session) { changed = !!this.files.size; this.reset(); this.session = session; }
    this.available = new Map(files.filter(file => reviewed[file.path] !== file.revision).map(file => [file.path, file]));
    for (const [path, state] of this.files) {
      const file = this.available.get(path);
      if (file && state.sourceKey === destructionKey(file)) continue;
      changed = true; this.files.delete(path); this.excluded.add(path); this.notify(path);
    }
    if (this.global) for (const [path, file] of this.available) {
      if (!this.excluded.has(path) && !this.files.has(path)) this.arm(this.views.get(path) || file);
    }
    return changed;
  }
  view(path: string, file?: DestructionFile) {
    if (!file) { this.views.delete(path); return false; }
    this.views.set(path, file);
    const state = this.files.get(path);
    if (!state || state.key === destructionKey(file)) return false;
    this.arm(file); return true;
  }
  retryCompletion(file: DestructionFile) {
    const state = this.target(file);
    if (state) { state.finished = false; this.notify(file.path); }
  }
  toggle(file: DestructionFile, combat?: DestructionCombat) {
    if (this.target(file)) { this.files.delete(file.path); this.excluded.add(file.path); this.notify(file.path); return false; }
    if (!this.available.has(file.path) || file.comparison?.kind === 'history') return false;
    this.excluded.delete(file.path); this.arm(file, combat); return true;
  }
  toggleAll() {
    const enable = !this.global;
    this.reset(); this.global = enable;
    if (enable) for (const file of this.available.values()) this.arm(this.views.get(file.path) || file);
    return enable;
  }
  shoot(file: DestructionFile, aim: ShotAim, point: { x: number; y: number }, weapon: string, effect: string, charge: number, threshold: number, radius = 28) {
    const state = this.target(file);
    if (!state || state.finished) return;
    const hit = this.surfaces.get(state.key)?.hit(aim, point, radius);
    // Normal destruction requires new material. A cinematic target accepts any
    // actual panel contact, so both guns can damage the same area independently.
    if (!hit || !(state.combat?.hitbox === 'panel' ? hit.contact : hit.changed)) return;
    state.shots++;
    const maximum = state.combat?.health ?? threshold;
    state.damage = state.shots * (state.combat?.damagePerHit ?? 1);
    state.finished = maximum > 0 && state.damage >= maximum - 1e-9;
    if (state.finished) state.damage = maximum;
    const shot: DestructionShot = { path: file.path, key: state.key, shots: state.shots,
      progress: maximum > 0 ? Math.min(1, state.damage / maximum) : 0, complete: state.finished,
      point: { ...point }, weapon, effect, charge, radius, fragments: hit.fragments };
    this.notify(file.path);
    for (const callback of this.effects) callback(shot);
    return shot;
  }
}
