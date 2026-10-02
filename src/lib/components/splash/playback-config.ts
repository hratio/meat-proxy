import startupPreset from './startup.json';
import type { LandscapeConfig, LandscapeOptions } from './landscape-config';

/** Shared landscape settings; artwork and its timing live in splash2.json. */
export interface SplashConfig { landscape: LandscapeConfig }
export type SplashOptions = { landscape?: LandscapeOptions };
// JSON imports widen tuples and enum strings; the authoring store validates the preset.
export const defaultSplashConfig = startupPreset as unknown as SplashConfig;

// Playback merges trusted settings without importing authoring validation.
export function resolveSplashConfig(options: SplashOptions = {}): SplashConfig {
  const base = defaultSplashConfig.landscape, patch = options.landscape ?? {};
  const landscape = { ...base, ...patch };
  for (const key of ['sequence', 'camera', 'city', 'landmarks', 'docks', 'waterThings', 'mountains', 'lighting', 'weather', 'water', 'lightning', 'cinema', 'quality'] as const) {
    Object.assign(landscape, { [key]: { ...base[key], ...patch[key] } });
  }
  landscape.sequence.garage = { ...base.sequence.garage, ...patch.sequence?.garage };
  return { landscape: landscape as LandscapeConfig };
}
