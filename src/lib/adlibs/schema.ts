import { z } from 'zod';

const id = z.string().trim().regex(/^[a-z][a-z0-9-]{0,63}$/, 'Use a lowercase ID with letters, numbers, and hyphens.');
const name = z.string().trim().min(1).max(100);
export const adlibClipSchema = z.object({
  id, name, category: id,
  url: z.string().trim().max(2000).regex(/^(\/(?!\/)|https?:\/\/)/, 'Use a served audio path or an HTTP(S) URL.'),
  enabled: z.boolean().default(true),
  durationSec: z.number().positive().max(600).optional(),
  text: z.string().trim().max(1200).optional(),
  gain: z.number().min(0).max(2).default(1)
});
export const adlibSchema = z.object({
  gapMs: z.number().int().min(0).max(600000).default(0),
  gain: z.number().min(0).max(2).default(1),
  categories: z.array(z.object({ id, name })).max(64).default([]),
  clips: z.array(adlibClipSchema).max(256).default([])
}).superRefine((value, ctx) => {
  for (const key of ['categories', 'clips'] as const) {
    const ids = value[key].map(item => item.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: [key], message: 'IDs must be unique.' });
  }
  const categories = new Set(value.categories.map(category => category.id));
  value.clips.forEach((clip, index) => {
    if (!categories.has(clip.category)) ctx.addIssue({ code: 'custom', path: ['clips', index, 'category'], message: 'Choose an existing category.' });
  });
});

export type AdlibConfig = z.infer<typeof adlibSchema>;
export type AdlibClip = z.infer<typeof adlibClipSchema>;
