import { transitionDefaults, type AvatarTransitions } from './transitions';
import type { MockDaddyEffectsOptions } from './effects';
import { mergeDefaults, studioDefaults, type Overrides } from '../tuning';

export const effectPresets = {
  normal: { glowIntensity: 3, glowSize: 1.3, glare: .35, sparkle: .3, glareSpeed: .18, smoke: .35, fire: 0, embers: .55, reflections: .45, wind: { x: .04, y: 0, z: 0 } },
  shocky: { glowIntensity: 8, glowSize: 1.5, glare: .65, sparkle: .7, glareSpeed: .4, smoke: .75, fire: .2, embers: 1, reflections: .8, wind: { x: -.3, y: .06, z: 0 } },
  onfire: { glowIntensity: 12, glowSize: 1.7, glare: .5, sparkle: .5, glareSpeed: .3, smoke: 1, fire: 1, embers: 1, reflections: .7, wind: { x: .4, y: .1, z: 0 } }
} satisfies Record<string, MockDaddyEffectsOptions>;

export type AvatarEffectsPreset = keyof typeof effectPresets;
export type AvatarTilt = { pitch: number; yaw: number; roll: number };
export type AvatarMotion = { amount: number; speed: number; responseMs: number };
export type AvatarFraming = { offsetXPx: number; offsetYPx: number; zoom: number };
export type AvatarQuality = { renderScale: number; fps: number };

export type AvatarPresentation = {
  framing: AvatarFraming;
  quality: AvatarQuality;
  tilt: AvatarTilt;
  motion: AvatarMotion;
  effects: AvatarEffectsPreset;
  effectOverrides: Partial<MockDaddyEffectsOptions>;
  effectsEnabled: boolean;
  transitions: AvatarTransitions;
};

// Read older studio files/drafts while dropping the canvas sizing and HUD controls.
export type AvatarOverrides = Overrides<AvatarPresentation> & {
  placement?: { offsetXPx?: number; offsetYPx?: number; zoom?: number };
};

export function mergeAvatarPresentation(base: AvatarPresentation, overrides?: AvatarOverrides): AvatarPresentation {
  const { placement, ...current } = overrides || {};
  const migrated = placement ? mergeDefaults(base, {
    framing: {
      offsetXPx: placement.offsetXPx,
      // The old mount used 62px as its centered vertical position.
      offsetYPx: placement.offsetYPx === undefined ? undefined : placement.offsetYPx - 62,
      zoom: placement.zoom
    }
  }) : base;
  return mergeDefaults(migrated, current);
}

// Studio overrides are bundled into the release, independently of user settings.
export const avatarDefaults = mergeAvatarPresentation({
  framing: { offsetXPx: 0, offsetYPx: 0, zoom: 1 },
  quality: { renderScale: 2, fps: 45 },
  tilt: { pitch: 0, yaw: 0, roll: 0 },
  motion: { amount: .15, speed: 1, responseMs: 180 },
  effects: 'normal',
  effectOverrides: {},
  effectsEnabled: true,
  transitions: { ...transitionDefaults }
}, studioDefaults.avatar);
