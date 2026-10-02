import { z } from 'zod';
import { subtitleFonts } from './splash2-subtitles';
import { controls } from '../../../../dev/tooling/splash/color-workshop/grade.mjs';
import { splash2TimingNames, splash2LayerNames, splash2PortraitNames, splash2Entrances, splash2DriftPartNames, neutralSplash2Grade, type Splash2DriftPart, type Splash2ColorGrade, type Splash2LayerName, type Splash2Timing } from './splash2-playback-config';
export * from './splash2-playback-config';

const finite = (min: number, max: number) => z.number().min(min).max(max);
const layerSchema = z.strictObject({ x: finite(-100, 100), y: finite(-100, 100), scale: finite(.05, 4), rotation: finite(-180, 180) });
const motionSchema = z.strictObject({ entrance: z.enum(splash2Entrances), distance: finite(0, 200), punch: finite(1, 5), driftX: finite(-10, 10).default(0), driftY: finite(-10, 10).default(0) });
const driftRateSchema = z.strictObject({ x: finite(-10, 10), y: finite(-10, 10) });
const driftSchema = z.strictObject({
  start: z.enum(['assembled', 'time']), at: finite(0, 60000),
  parts: z.strictObject(Object.fromEntries(splash2DriftPartNames.map(part => [part, driftRateSchema])) as Record<Splash2DriftPart, typeof driftRateSchema>)
});
const colorSchema = z.strictObject(Object.fromEntries(controls.map(control => [control.key, finite(control.min, control.max).default(control.value)])) as Record<keyof Splash2ColorGrade, z.ZodDefault<ReturnType<typeof finite>>>);
const colorsSchema = z.strictObject(Object.fromEntries(splash2LayerNames.map(name => [name, colorSchema.default(() => ({ ...neutralSplash2Grade }))])) as Record<Splash2LayerName, z.ZodDefault<typeof colorSchema>>);
const audioTrackSchema = z.strictObject({
  url: z.string().trim().min(1).max(2000), enabled: z.boolean(), at: finite(0, 300000), offset: finite(0, 300000),
  volume: finite(0, 1), fadeIn: finite(0, 60000), fadeOut: finite(0, 60000),
  end: z.enum(['clip', 'time', 'handoff', 'game']), endAt: finite(0, 300000)
});
const subtitleCueSchema = z.strictObject({
  id: z.string().min(1).max(80), text: z.string().max(240),
  startMs: finite(0, 600000).int(), endMs: finite(0, 600000).int()
}).refine(cue => cue.endMs > cue.startMs, 'Subtitle end must follow its start');
const subtitlesSchema = z.strictObject({
  enabled: z.boolean(), font: z.enum(subtitleFonts), fontSize: finite(10, 32),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), opacity: finite(.1, 1),
  tracking: finite(-.03, .2), bottom: finite(1, 30), offsetMs: finite(-30000, 30000),
  cues: z.array(subtitleCueSchema).max(128).refine(cues => new Set(cues.map(cue => cue.id)).size === cues.length, 'Subtitle IDs must be unique')
});
export const splash2ConfigSchema = z.strictObject({
  subtitles: subtitlesSchema.optional(),
  portrait: z.enum(splash2PortraitNames),
  introduction: z.strictObject({ enabled: z.boolean(), exitMs: finite(100, 3000), exitDistance: finite(50, 250),
    entranceMs: finite(100, 2000), firingMs: finite(1000, 8000), musicFadeMs: finite(100, 3000) }).optional(),
  openingDelay: finite(0, 300000).optional(),
  skipTo: finite(0, 300000).optional(),
  // Older saved/exported settings retain their first clip when upgraded.
  audio: z.preprocess(value => value && typeof value === 'object' && 'track1' in value ? value.track1 : value, audioTrackSchema).optional(),
  timing: z.strictObject(Object.fromEntries(splash2TimingNames.map(key => [key, finite(0, 60000)])) as Record<keyof Splash2Timing, ReturnType<typeof finite>>),
  layers: z.strictObject(Object.fromEntries(splash2LayerNames.map(name => [name, layerSchema])) as Record<Splash2LayerName, typeof layerSchema>),
  motion: z.strictObject(Object.fromEntries(splash2LayerNames.map(name => [name, motionSchema])) as Record<Splash2LayerName, typeof motionSchema>),
  drift: driftSchema.optional(),
  color: colorsSchema.default(() => colorsSchema.parse({})),
  impact: finite(0, 5),
  scene: z.strictObject({ enabled: z.boolean(), speed: finite(-200, 200), opacity: finite(0, 1), fadeInMs: finite(0, 60000), fadeOutMs: finite(0, 60000) })
});
