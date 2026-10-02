import { z } from 'zod';
import { recordedSounds } from './samples';

const audioUrl = z.string().trim().min(1).max(2000);
export const weaponSoundSchema = z.object({
  shot: audioUrl.describe('Required single-shot sound URL. Bundled clips use Ogg Opus; the browser also decodes MP3, FLAC, and WAV.'),
  start: audioUrl.optional().describe('Optional trigger-down/spin-up sound, layered over the first shot.'),
  loop: audioUrl.optional().describe('Optional seamless sustained-fire recording. Replaces repeated shot sounds while held.'),
  stop: audioUrl.optional().describe('Optional release/spin-down tail after sustained fire.'),
  stopDelayMs: z.number().int().min(0).max(5000).default(0).describe('Delay from trigger release to the tail, e.g. 1500 for a distant cannon echo.'),
  stopAfter: z.enum(['loop', 'shot']).default('loop').describe('Play the release tail after a sustained loop, or after any audible shot/burst.'),
  loopDelayMs: z.number().int().min(0).max(3000).default(180),
  loopStartSec: z.number().min(0).default(0),
  loopEndSec: z.number().min(0).default(0).describe('Zero uses the end of the decoded file.'),
  attackMs: z.number().int().min(0).max(500).optional().describe('Crossfade into the sustained loop and fade on cancellation. When omitted, uses releaseMs.'),
  releaseMs: z.number().int().min(0).max(500).default(70).describe('Fade out sustained fire on trigger release, independent of the delayed tail.'),
  maxVoices: z.number().int().min(1).max(24).default(6),
  gain: z.number().min(0).max(2).default(1)
});

export const weaponProfileSchema = z.object({
  scale: z.number().min(.1).max(5).default(1).describe('Individual held weapon scale; its fitted glove scales with it.'),
  recoilScale: z.number().min(0).max(3).default(1).describe('Recoil multiplier for this weapon.'),
  barrelRecoilScale: z.number().min(0).max(3).default(1).describe('Flaky Assertions barrel travel: 1 is the original distance, 1.5 pulls back 50% farther, and 0 disables barrel movement. Independent of whole-weapon recoil.'),
  sprayRoll: z.boolean().default(false).describe('Animate weapon roll while the trigger is held, around the aiming axis.'),
  sprayMode: z.enum(['inward', 'oscillate']).default('inward').describe('Hold the configured spray angle, or rock back and forth between the minimum and maximum angles.'),
  sprayDelayMs: z.number().int().min(0).max(5000).default(50).describe('Hold the trigger this long before the spray motion starts. Each press starts a fresh delay; 0 starts immediately.'),
  sprayTransitionMs: z.number().int().min(100).max(5000).default(1000).describe('Time to ease into the spray motion, and to return to rest after release.'),
  sprayAngleDeg: z.number().min(-180).max(180).default(90).describe('Target roll in normal spray mode, relative to the resting pose. Positive rolls inward, negative rolls outward; 0 keeps the resting angle. Mirrored in the other weapon slot. Ignored in oscillate mode.'),
  sprayMinAngleDeg: z.number().min(-90).max(0).default(-30).describe('Negative roll limit for oscillation, relative to the resting pose. Mirrored in the other weapon slot.'),
  sprayMaxAngleDeg: z.number().min(0).max(90).default(30).describe('Positive roll limit for oscillation, relative to the resting pose. Mirrored in the other weapon slot.'),
  sprayPeriodMs: z.number().int().min(100).max(5000).default(500).describe('Duration of one complete left-right rocking cycle. Lower values rock faster.'),
  sprayRecoilMultiplier: z.number().min(0).max(1).default(.3).describe('Recoil remaining once the spray motion has fully blended in; 0.3 means 30 percent.'),
  gloveGlowOnFire: z.boolean().default(true).describe('Light up this weapon\'s glove lettering while the trigger is held.'),
  effect: z.enum(['ballistic', 'canisters', 'keycaps', 'missiles', 'sludge', 'plasma', 'disks']).default('ballistic'),
  chargeMs: z.number().int().min(100).max(5000).default(1200).describe('Plasma: hold this long for a full charge. Release fires; a quick tap fires a small energy bolt.'),
  chargeSize: z.number().min(1).max(5).default(3).describe('Plasma: projectile size at full charge, relative to a tap.'),
  fireIntervalMs: z.number().int().min(40).max(2000).optional().describe('When omitted, use the primary/secondary fire interval.'),
  destructionRadiusPx: z.number().min(4).max(160).default(28).describe('Destruction blast radius in CSS pixels, before the slot projectile size/weight and plasma charge multipliers.'),
  muzzleScale: z.number().min(0.1).max(4).default(1),
  sound: weaponSoundSchema
});
export type WeaponSound = z.infer<typeof weaponSoundSchema>;
export type WeaponProfile = z.infer<typeof weaponProfileSchema>;

const recorded = (sample: string, effect: WeaponProfile['effect'], scale = 1) => {
  const preset = recordedSounds[sample];
  const aircraft = effect === 'canisters' || effect === 'missiles';
  return weaponProfileSchema.parse({
    effect, muzzleScale: scale, fireIntervalMs: preset.fireIntervalMs, sound: preset.sound,
    destructionRadiusPx: effect === 'missiles' ? 64 : effect === 'canisters' ? 42 : effect === 'disks' ? 36 : sample === 'remington' ? 38 : 28,
    sprayRoll: effect === 'ballistic' || aircraft,
    ...(aircraft ? { sprayMode: 'oscillate', sprayTransitionMs: 200 } : {})
  });
};

export const weaponProfiles: Record<string, WeaponProfile> = {
  'iron-verdict': recorded('desert-eagle', 'ballistic', 1.2),
  'twin-clause': recorded('remington', 'ballistic', 1.6),
  'rhein-9': recorded('mp40', 'ballistic'),
  'stack-10': recorded('uzi', 'ballistic', 0.8),
  'ak-256': recorded('ak-47', 'ballistic', 1.1),
  'elastic-saw': recorded('lmg-762', 'ballistic', 1.1),
  'brrrt-10': recorded('a10-minigun', 'canisters', 1.5),
  'heavenfire-67': recorded('missile', 'missiles', 1.2),
  'daz-ratatat': recorded('keyboard', 'keycaps', 0.65),
  'merge-obliterator': weaponProfileSchema.parse({
    effect: 'plasma', fireIntervalMs: 480, muzzleScale: 1.6, destructionRadiusPx: 36,
    sound: { shot: '/audio/library/merge-obliterator/shot.ogg' }
  }),
  'auto-bmg': weaponProfileSchema.parse({ ...recorded('bolt-rifle', 'ballistic', 1.9), sprayRoll: false, recoilScale: 1.65 }),
  'slopdisk': weaponProfileSchema.parse({ ...recorded('floppyslop', 'disks', .7), sprayRoll: false, recoilScale: .55 }),
  'flaky-assertions': weaponProfileSchema.parse({
    ...recorded('mk46', 'ballistic', 2), scale: .68, sprayRoll: false,
    recoilScale: 2.6, destructionRadiusPx: 46
  })
};

export const fallbackWeaponProfile = weaponProfileSchema.parse({
  effect: 'ballistic', sound: { shot: recordedSounds.mp40.sound!.shot }
});

// Full URLs support custom models; bundled model IDs make TOML overrides readable.
export function weaponProfile(model: string, overrides: Record<string, WeaponProfile>) {
  const id = model.split('/').pop()?.replace(/\.glb(?:\?.*)?$/, '') || '';
  return overrides[model] || overrides[id] || weaponProfiles[id] || fallbackWeaponProfile;
}

export const weaponEffectsSchema = z.object({
  enabled: z.boolean().default(true),
  particleLimit: z.number().int().min(8).max(200).default(56),
  textureSize: z.number().int().min(32).max(512).default(128),
  muzzleSize: z.number().min(0.1).max(2).default(0.32),
  muzzleLight: z.number().min(0).max(8).default(0.65),
  plumeCount: z.number().int().min(1).max(8).default(2),
  plumeMs: z.number().int().min(30).max(500).default(75),
  smokeMs: z.number().int().min(100).max(3000).default(750),
  debrisMs: z.number().int().min(100).max(3000).default(1100),
  ejectSpeed: z.number().min(0.1).max(10).default(2.7),
  ejectLift: z.number().min(0).max(12).default(3.8),
  debrisSize: z.number().min(0.02).max(0.5).default(0.12),
  gravity: z.number().min(0).max(20).default(4.5),
  tumbleSpeed: z.number().min(0).max(30).default(12),
  sludgeDrops: z.number().int().min(1).max(12).default(5),
  projectileSpeed: z.number().min(1).max(30).default(8),
  projectileMs: z.number().int().min(100).max(2000).default(650),
  missilePodOffset: z.number().min(0).max(2).default(0.38),
  missileTrailMs: z.number().int().min(16).max(200).default(55)
});
export type WeaponEffects = z.infer<typeof weaponEffectsSchema>;
