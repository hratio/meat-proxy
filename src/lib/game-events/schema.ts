import { z } from 'zod';
import { adlibSchema } from '../adlibs/schema';

export const gameEventSources = {
  'background-shot': 'Background shot',
  'weapon-shot': 'Any weapon shot',
  'destruction-file-start': 'Destruction mode: one file',
  'destruction-all-start': 'Destruction mode: all files',
  'file-complete': 'File completed',
  'review-complete': 'All review files completed',
  'color-unlock-start': 'Color picker: challenge started',
  'color-unlock-cancel': 'Color picker: escaped',
  'color-unlock-success': 'Color picker: unlocked'
} as const;
export type GameEventSource = keyof typeof gameEventSources;
export type GameEvent = { type: 'shot'; weapon: string; background: boolean }
  | { type: Exclude<GameEventSource, 'background-shot' | 'weapon-shot'> };
export type ColorUnlockEvent = Extract<GameEventSource, `color-unlock-${string}`>;

const id = z.string().trim().regex(/^[a-z][a-z0-9-]{0,63}$/, 'Use a lowercase ID with letters, numbers, and hyphens.');
const expression = z.enum(['Idle', 'Clench', 'Shout', 'ShadesPeek', 'Grin', 'Surprise']);
export const gameEventRuleSchema = z.object({
  id, name: z.string().trim().min(1).max(100), enabled: z.boolean().default(true),
  events: z.array(z.enum(Object.keys(gameEventSources) as [GameEventSource, ...GameEventSource[]])).min(1).max(Object.keys(gameEventSources).length),
  weapons: z.array(z.string().trim().min(1).max(1000)).max(64).default([]),
  voice: z.union([z.object({ category: id }).strict(), z.object({ clip: id }).strict()]).optional()
    .describe('Omit for no voice. Choose a random category or one specific clip from the voice library.'),
  hud: z.object({
    expression,
    durationMs: z.number().int().min(0).max(600000).optional(),
    finishCycle: z.boolean().default(true)
  }).optional(),
  transmission: z.object({
    title: z.string().trim().max(80).default('INCOMING TRANSMISSION'),
    text: z.string().trim().max(1200).default('').describe('Message text. Leave blank to use the selected voice clip transcript.'),
    expression: expression.default('ShadesPeek'),
    splash: z.enum(['signal', 'impact']).default('signal'),
    durationSec: z.number().positive().max(600).optional().describe('Reading time for a silent message; otherwise calculated from its text.'),
    movement: z.boolean().optional(),
    introSeconds: z.number().min(0).max(5).optional(),
    outroSeconds: z.number().min(0).max(5).optional()
  }).optional(),
  interrupt: z.boolean().default(false),
  incrementChance: z.number().min(0).max(1).default(1),
  minCount: z.number().int().min(1).max(10000).default(1),
  maxCount: z.number().int().min(1).max(10000).default(1),
  cooldownMs: z.number().int().min(0).max(600000).default(0)
}).superRefine((rule, ctx) => {
  if (rule.maxCount < rule.minCount) ctx.addIssue({ code: 'custom', path: ['maxCount'], message: 'Maximum count must be at least the minimum.' });
  if (rule.enabled && !rule.voice && !rule.hud && !rule.transmission) ctx.addIssue({ code: 'custom', path: ['enabled'], message: 'Choose a voice, HUD reaction, or transmission before enabling this rule.' });
  if (rule.enabled && rule.transmission && !rule.transmission.text && !rule.voice) ctx.addIssue({ code: 'custom', path: ['transmission', 'text'], message: 'Enter message text for a silent transmission.' });
});

export const gameEventSchema = z.object({
  rules: z.array(gameEventRuleSchema).max(64).default([])
}).superRefine((value, ctx) => {
  if (new Set(value.rules.map(rule => rule.id)).size !== value.rules.length) ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Rule IDs must be unique.' });
});

/** Validate references across the authored voice library and event rules together. */
export const gameEventContentSchema = z.object({
  adlibs: adlibSchema.prefault({}),
  events: gameEventSchema.prefault({})
}).superRefine(({ adlibs, events }, ctx) => {
  events.rules.forEach((rule, index) => {
    const voice = rule.voice;
    if (!voice) return;
    if ('category' in voice) {
      if (!adlibs.categories.some(category => category.id === voice.category)) ctx.addIssue({ code: 'custom', path: ['events', 'rules', index, 'voice', 'category'], message: 'Choose an existing voice category.' });
      else if (rule.enabled && !adlibs.clips.some(clip => clip.enabled && clip.category === voice.category)) ctx.addIssue({ code: 'custom', path: ['events', 'rules', index, 'voice'], message: 'Choose a category with an enabled clip, or select None.' });
    } else {
      const clip = adlibs.clips.find(clip => clip.id === voice.clip);
      if (!clip || (rule.enabled && !clip.enabled)) ctx.addIssue({ code: 'custom', path: ['events', 'rules', index, 'voice', 'clip'], message: 'Choose an available voice clip, or select None.' });
    }
  });
});

export type GameEventRule = z.infer<typeof gameEventRuleSchema>;
export type GameEventConfig = z.infer<typeof gameEventSchema>;
export type GameEventContent = z.infer<typeof gameEventContentSchema>;
