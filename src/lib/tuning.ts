import saved from '../../config/studio.json';
import { migrateHudSettings } from './hud-config';
import { migrateFileFilterSettings } from './file-filter-presets';
import type { AvatarOverrides } from './avatar/presentation';
import type { AvatarLabOptions } from './avatar/preview';
import type { Config } from './config';
import type { AdlibConfig } from './adlibs/schema';
import type { GameEventConfig } from './game-events/schema';

export type Overrides<T> = { [K in keyof T]?: T[K] extends object ? Overrides<T[K]> : T[K] };
export type StudioDefaults = {
  avatar?: AvatarOverrides;
  playback?: Partial<Omit<AvatarLabOptions, 'paused'>>;
  game?: Overrides<Config>;
  adlibs?: AdlibConfig;
  events?: GameEventConfig;
};

// JSON imports widen saved enum strings; narrow them at the config boundary.
export const studioDefaults: StudioDefaults = { ...saved } as StudioDefaults;
if (studioDefaults.game) studioDefaults.game = migrateFileFilterSettings(migrateHudSettings(studioDefaults.game));

// Authored tuning is bundled with the app. Personal preferences are applied after it.
export function mergeDefaults<T>(base: T, overrides: Overrides<T> | undefined): T {
  const result = structuredClone(base);
  if (!overrides) return result;
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeDefaults(result[key] || {} as T[keyof T], value as Overrides<T[keyof T]>)
      : value as T[keyof T];
  }
  return result;
}
