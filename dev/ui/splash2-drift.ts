import type { Splash2Config, Splash2Drift, Splash2DriftPart } from '$lib/components/splash/splash2-playback-config';

export const driftLabels: Record<Splash2DriftPart, string> = {
  background: 'Back 1', structure: 'Pylons & rings', dude: 'Reviewer', title: 'Frame & title', lgtm: 'LGTM'
};
function rates(background: number, structure: number, dude: number, title: number): Splash2Drift['parts'] {
  return { background: { x: background, y: 0 }, structure: { x: structure, y: 0 }, dude: { x: dude, y: 0 }, title: { x: title, y: 0 }, lgtm: { x: 0, y: 0 } };
}
export const driftPresets = [
  { name: 'Gentle parallax', hint: 'Recommended · quiet depth, calm lettering', parts: rates(.08, .18, -.28, -.12) },
  { name: 'Stronger parallax', hint: 'More separation while the verdict lands', parts: rates(.14, .32, -.48, -.20) },
  { name: 'Reverse parallax', hint: 'Same gentle depth in the opposite direction', parts: rates(-.08, -.18, .28, .12) },
  { name: 'No drift', hint: 'Hold the assembled composition still', parts: rates(0, 0, 0, 0) }
];

/** Presets modify shared drift rates only, preserving every authored cue and placement. */
export function applyDriftPreset(config: Splash2Config, parts: Splash2Drift['parts']) {
  config.drift.parts = structuredClone(parts);
}
