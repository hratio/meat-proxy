import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color.');
const strength = z.number().min(0).max(5);
const directional = (defaults: { color: string; intensity: number; azimuth: number; elevation: number }) => z.strictObject({
  color: color.default(defaults.color),
  intensity: strength.default(defaults.intensity),
  azimuth: z.number().min(-180).max(180).default(defaults.azimuth).describe('Light direction in degrees: 0 faces you, 90 is right, ±180 is behind.'),
  elevation: z.number().min(-90).max(90).default(defaults.elevation).describe('Height of the light in degrees above the horizon.')
});

export const weaponExposureSchema = z.number().min(.1).max(3).default(.78).describe('Overall weapon brightness, including reflections and glowing details.');

/** Dim, cool steel with a restrained warm edge. Keep authored PBR materials intact. */
export const weaponLightingSchema = z.strictObject({
  ambient: z.strictObject({
    skyColor: color.default('#a5b8ce'),
    groundColor: color.default('#242832'),
    intensity: strength.default(.45)
  }).prefault({}),
  key: directional({ color: '#e3cfb5', intensity: 1.5, azimuth: -35, elevation: 40 }).prefault({}),
  fill: directional({ color: '#779ab8', intensity: .45, azimuth: -110, elevation: 10 }).prefault({}),
  rim: directional({ color: '#d58a57', intensity: 1.1, azimuth: 135, elevation: 25 }).prefault({}),
  environmentIntensity: z.number().min(0).max(2).default(.3).describe('Reflection brightness on metal. Lower this first if polished surfaces look washed out.'),
  environmentRotation: z.number().min(-180).max(180).default(0).describe('Rotate the reflected room around the weapon, in degrees.')
});

export type WeaponLighting = z.infer<typeof weaponLightingSchema>;
export type WeaponLight = WeaponLighting['key'];
export type WeaponLightingSettings = { lighting: WeaponLighting; exposure: number };
