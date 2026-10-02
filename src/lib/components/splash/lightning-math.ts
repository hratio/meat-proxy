import type { LandscapeConfig, LightningCue } from './landscape-config';
import { seededRandom } from './landscape-math';

export type LightningSettings = LandscapeConfig['lightning'];
export type StrikeKind = 'forked' | 'crawler' | 'sheet';
export type StrikeSample = { id: number; age: number; kind: StrikeKind; energy: number; leader: number; start?: number; cue?: LightningCue };
export type BoltPoint = [number, number, number];
export type BoltSegment = { a: BoltPoint; b: BoltPoint; progress: number; strength: number };

/** Stop a positioned branch at the impact plane instead of drawing below
 * water or mirroring an underwater channel back above the horizon. */
export function clipBoltSegment(segment: BoltSegment, height: number): BoltSegment | undefined {
  const { a, b } = segment;
  if (a[1] >= height && b[1] >= height) return segment;
  if (a[1] < height && b[1] < height) return;
  const t = (height - a[1]) / (b[1] - a[1]);
  const hit: BoltPoint = [a[0] + (b[0] - a[0]) * t, height, a[2] + (b[2] - a[2]) * t];
  return { ...segment, a: a[1] < height ? hit : a, b: b[1] < height ? hit : b };
}

/** Seeded slots make seeking and replay independent of frame rate or tab visibility. */
export function sampleLightning(seconds: number, seed: number, settings: LightningSettings): StrikeSample | undefined {
  if (!settings.enabled || seconds < 0) return;
  let selected: StrikeSample | undefined;
  const consider = (id: number, start: number, cue?: LightningCue) => {
    const age = (seconds - start) / settings.duration;
    if (age < 0 || age >= 1.05) return;
    const options = cue ? { ...settings, style: cue.style, intensity: settings.intensity * cue.intensity } : settings;
    const event = { ...strikeSample(id, age, options), start, cue };
    // One ribbon buffer shows the strongest active stroke. Close cues can
    // overlap without a newer dim leader suppressing an existing bright flash.
    if (!selected || event.energy > selected.energy || (event.energy === selected.energy && start > selected.start!)) selected = event;
  };
  if (settings.timing !== 'scheduled') {
    const slot = Math.floor(seconds / settings.interval);
    const first = Math.max(0, Math.floor((seconds - settings.duration * 1.05) / settings.interval) - 1);
    for (let index = slot; index >= first; index--) {
      const id = (Math.imul(index + 1, 7919) ^ seed) >>> 0, random = seededRandom(id);
      consider(id, (index + .12 + random() * .4 * settings.irregularity) * settings.interval);
    }
  }
  if (settings.timing !== 'automatic') {
    for (const cue of settings.cues) consider((cue.timeMs ^ seed ^ 0x5ca1ed) >>> 0, cue.timeMs / 1000, cue);
  }
  return selected;
}

export function strikeSample(id: number, age: number, settings: LightningSettings): StrikeSample {
  const random = seededRandom(id ^ 0x137ad);
  const kind = settings.style === 'mixed' ? (['forked', 'forked', 'sheet', 'crawler'] as const)[Math.floor(random() * 4)] : settings.style;
  // A dim advancing leader, then one sharp return stroke and weaker re-strikes.
  let energy = 0;
  for (let i = 0; i <= settings.afterStrokes; i++) {
    const onset = .1 + i * .23 + (i ? random() * .045 : 0);
    const t = age - onset;
    if (t >= 0) energy += Math.min(1, t / .006) * Math.exp(-t / (kind === 'sheet' ? .13 : .055)) * Math.pow(.57, i);
  }
  return { id, age, kind, energy: energy * settings.intensity, leader: Math.min(1, Math.max(0, age / .1)) };
}

/** Hierarchical displacement keeps a coherent channel, with thinner terminating branches. */
export function boltSegments(seed: number, kind: StrikeKind, branching: number): BoltSegment[] {
  if (kind === 'sheet') return [];
  const random = seededRandom(seed), segments: BoltSegment[] = [];
  function path(a: BoltPoint, b: BoltPoint, roughness: number, depth: number): BoltPoint[] {
    if (!depth) return [a, b];
    const mid: BoltPoint = a.map((value, i) => (value + b[i]) * .5 + (random() - .5) * roughness * (i === 1 ? .35 : 1)) as BoltPoint;
    const left = path(a, mid, roughness * .53, depth - 1), right = path(mid, b, roughness * .53, depth - 1);
    return [...left.slice(0, -1), ...right];
  }
  const points = path(kind === 'crawler' ? [-420, 460, 0] : [(random() - .5) * 170, 620, 0],
    kind === 'crawler' ? [480, 390, -90] : [0, 10, 0], kind === 'crawler' ? 190 : 170, 6);
  for (let i = 1; i < points.length; i++) {
    segments.push({ a: points[i - 1], b: points[i], progress: i / (points.length - 1), strength: 1 });
    if (i > 6 && i < 53 && random() < branching * .28) {
      const a = points[i], side = random() > .5 ? 1 : -1;
      const end: BoltPoint = [a[0] + side * (65 + random() * 170), a[1] - 45 - random() * 160, a[2] + (random() - .5) * 90];
      const branch = path(a, end, 65, 4);
      for (let j = 1; j < branch.length; j++) segments.push({ a: branch[j - 1], b: branch[j], progress: Math.min(1, i / 64 + j / 70), strength: .5 * (1 - j / 20) });
    }
  }
  return segments;
}
