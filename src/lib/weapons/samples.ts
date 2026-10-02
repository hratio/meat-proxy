import manifest from '../manifest.json';
import type { WeaponSound } from './profiles';

export type AudioClip = { url: string; durationSec: number; segments?: { start: number; end: number }[] };
export type AudioPreset = {
  id: string;
  name: string;
  group: 'automatic' | 'rotary' | 'single' | 'missile' | 'mechanical' | 'effect';
  fireIntervalMs?: number;
  sound?: Partial<WeaponSound> & Pick<WeaponSound, 'shot'>;
  clips: Record<string, AudioClip>;
};

// JSON inference adds absent clip keys as `undefined` across presets.
export const audioPresets = [...manifest.presets] as unknown as AudioPreset[];
export const recordedSounds = Object.fromEntries(audioPresets.map(preset => [preset.id, preset]));
