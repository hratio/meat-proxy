import { z } from 'zod';

export const destructionSchema = z.object({
  shotsToComplete: z.number().int().min(0).max(10000).default(80).describe('Starting health for each file. Hits removing new material take 1 HP; empty hits do not count. Set to 0 for unlimited destruction.'),
  borderStyle: z.enum(['lock', 'glow', 'dashed']).default('lock'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff7849'),
  particleLimit: z.number().int().min(16).max(512).default(256).describe('Maximum flying characters across all files. Extra damage still removes text.'),
  particleLifetimeMs: z.number().int().min(150).max(1500).default(650).describe('Maximum time a character stays airborne. Individual lifetimes vary slightly.'),
  particleSpeed: z.number().min(0).max(1600).default(320).describe('Outward launch speed in pixels per second, before speed variation.'),
  particleSpeedVariation: z.number().min(0).max(1).default(.85).describe('0 gives every character the same launch speed. 1 mixes slow fragments with occasional bursts up to 3× the base speed.'),
  particleSpreadDeg: z.number().min(0).max(180).default(75).describe('Random angle either side of the direction away from the impact. 0 is strictly outward; 180 allows any direction.'),
  particleLift: z.number().min(0).max(1000).default(40).describe('Extra upward launch speed in pixels per second. Lower it for a burst to all sides; raise it for an upward spray.'),
  particleGravity: z.number().min(0).max(3000).default(650).describe('Downward acceleration in pixels per second squared. 0 lets characters travel straight; higher values make them fall sooner.'),
  particleSpin: z.number().min(0).max(8).default(2.5).describe('Maximum spin in turns per second. Each character gets a random speed and clockwise or counterclockwise direction.')
});

export type DestructionSettings = z.infer<typeof destructionSchema>;
