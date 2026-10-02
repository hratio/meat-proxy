import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const gloveSchema = z.object({
  enabled: z.boolean().default(true),
  mainText: z.string().max(24).default('FIX IT'),
  altText: z.string().max(24).default('LGTM'),
  textColor: color.default('#cbd0d8'),
  glow: z.boolean().default(false),
  glowColor: color.default('#ed2945'),
  glowIntensity: z.number().min(0).max(4).default(1.5),
  pulse: z.boolean().default(false),
  pulseColor: color.default('#971b32'),
  pulseSeconds: z.number().min(.5).max(10).default(3)
});
export type GloveConfig = z.infer<typeof gloveSchema>;
