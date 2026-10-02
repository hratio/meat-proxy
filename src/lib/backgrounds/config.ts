import { z } from 'zod';

export const backgroundSchema = z.object({
  mode: z.enum(['none', 'image', 'color', 'scene']).default('image'),
  image: z.string().trim().min(1).max(255).default('fine-grain.svg').describe('Filename from src/lib/backgrounds/assets. Unknown images fall back to the theme background.'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#11120f'),
  opacity: z.number().min(0).max(1).default(0.028).describe('Image opacity, from 0 (transparent) to 1 (opaque).'),
  sizing: z.enum(['cover', 'contain', 'stretch', 'tile', 'center']).default('tile'),
  sceneOpacity: z.number().min(0).max(1).default(.35).describe('3D city opacity, independent of the image opacity.'),
  sceneBlur: z.number().min(0).max(20).default(2).describe('3D city blur in pixels.'),
  sceneFocus: z.number().min(0).max(1).default(.8).describe('Strength of the soft shade behind the review area.')
});

export type BackgroundConfig = z.infer<typeof backgroundSchema>;
export const defaultBackground = backgroundSchema.parse({});
