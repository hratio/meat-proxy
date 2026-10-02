import { z } from 'zod';
import { drivingSequenceSchema } from './sequence-config';

// Suggested slider ranges are authoring aids, not ceilings on typed values.
const number = (value: number, min: number, max: number) => z.number().min(min).meta({ sliderMax: max }).default(value);
const integer = (value: number, min: number, max: number) => z.number().int().min(min).meta({ sliderMax: max }).default(value);
const color = (value: string) => z.string().regex(/^#[\da-fA-F]{6}$/, 'Use a six-digit hex color.').default(value);

export const maxLightningCues = 256;
export const lightningCueSchema = z.strictObject({
  timeMs: z.number().int().min(0),
  style: z.enum(['forked', 'crawler', 'sheet', 'mixed']).default('forked'),
  x: number(0, -2400, 2400), distance: number(80, 2, 2500),
  height: number(120, 20, 1000), branches: number(1, 0, 1), intensity: number(1, 0, 4)
});
export type LightningCue = z.infer<typeof lightningCueSchema>;

/** Authoring controls, shared by the renderer, workbench and file writer. */
export const landscapeFields = z.strictObject({
  speed: number(70, -200, 200),
  opacity: number(.7, 0, 1),
  fadeInMs: number(1400, 0, 20000),
  fadeOutMs: number(1600, 0, 20000),
  seed: integer(8127, 0, 2147483647),
  sequence: drivingSequenceSchema.prefault({}),
  camera: z.strictObject({
    height: number(5, 1.2, 240), distance: number(330, 100, 700),
    targetHeight: number(35, -20, 300), fov: number(55, 25, 75),
    yaw: number(0, -35, 35), roll: number(0, -12, 12), offset: number(0, -2400, 2400),
    panDistance: number(660, 0, 2400), settleSeconds: number(2.2, .2, 10)
  }).prefault({}),
  city: z.strictObject({
    density: number(1, .35, 1.8), height: number(1, .35, 2.2), width: number(1, .5, 1.6),
    variation: number(1, 0, 1.5), roofDetail: number(1, 0, 1),
    buildingColor: color('#444b40'), trimColor: color('#272e27'),
    windowColor: color('#e9a250'), accentColor: color('#a9b785'), beaconColor: color('#ec4322'),
    windowBrightness: number(1, 0, 3), windowDensity: number(.4, 0, 1), windowScale: number(1, .5, 3),
    textureScale: number(1, .25, 4), weathering: number(1, 0, 2),
    pattern: z.enum(['panels', 'ribbed', 'concrete']).default('panels'), metalness: number(.15, 0, 1),
    glow: number(.6, 0, 2), lightLife: number(.35, 0, 1), lightSpeed: number(.5, 0, 2),
    beaconPulse: number(.65, 0, 1), beaconBrightness: number(1, 0, 12), beaconGlow: number(1.5, 0, 6)
  }).prefault({}),
  landmarks: z.strictObject({
    enabled: z.boolean().default(true),
    gateScale: number(1, .2, 3), gateX: number(-245, -1000, 1000),
    signBrightness: number(1.5, 0, 8),
    signSpeed: number(1, 0, 4),
    signColor: color('#ff1284'), signGlow: number(.65, 0, 3),
    spireScale: number(1, .2, 3), spireX: number(220, -1000, 1000),
    observatoryScale: number(1, .2, 3), observatoryX: number(735, -1000, 1000),
    observatoryText: z.string().max(256).default('ORBITAL OBSERVATORY'),
    observatoryTextStart: number(235, -360, 360), observatoryTextSize: number(5.2, .1, 7),
    observatoryTextSpacing: number(.3, 0, 3),
    observatorySignRotate: z.boolean().default(false), observatorySignSpeed: number(1, 0, 4),
    observatorySignReverse: z.boolean().default(false),
    observatorySignBrightness: number(1.5, 0, 8),
    observatorySignColor: color('#88e6ff'), observatorySignGlow: number(.65, 0, 3)
  }).prefault({}),
  docks: z.strictObject({
    enabled: z.boolean().default(true), density: number(1, .25, 1.5), scale: number(1, .5, 1.5),
    coastVariation: number(1, 0, 2), relief: number(1, 0, 3), pier: z.boolean().default(true),
    quay: z.boolean().default(true), quayHeight: number(3, 0, 10), panelWidth: number(8, 3, 20), quayColor: color('#35464a'),
    color: color('#171d18'), edgeColor: color('#3c4235'), lights: number(1, 0, 2)
  }).prefault({}),
  waterThings: z.strictObject({
    enabled: z.boolean().default(true), seed: integer(7319, 0, 2147483647),
    density: number(1, .1, 2), chairShare: number(.6, 0, 1), monitorShare: number(.24, 0, 1), scale: number(4, .5, 8),
    near: number(9, 3, 35), far: number(100, 40, 300), sink: number(.5, 0, 1),
    bob: number(.12, 0, .6), rocking: number(.22, 0, 1), drift: number(.3, 0, 2),
    color: color('#65717b'), accentColor: color('#7c3d43'), keyColor: color('#a4a18e'), wetness: number(.75, 0, 1)
  }).prefault({}),
  mountains: z.strictObject({
    enabled: z.boolean().default(true), height: number(1, .2, 2), distance: number(1, .65, 1.6),
    parallax: number(.22, 0, 1), ruggedness: number(1, .25, 2),
    rockColor: color('#3e3f39'), snowColor: color('#9b9786'), snowLine: number(640, 100, 1600), snowAmount: number(.5, 0, 1)
  }).prefault({}),
  lighting: z.strictObject({
    exposure: number(1, .2, 2.5), temperature: number(0, -1, 1),
    strength: number(1, 0, 2.5), azimuth: number(-50, -180, 180), elevation: number(50, 0, 90),
    keyColor: color('#b1bfcb'), ambient: number(.16, 0, 1), signSpill: number(.22, 0, 2),
    skyColor: color('#212523'), horizonColor: color('#695a46'), sunColor: color('#6c3d18'), sunGlow: number(1, 0, 2),
    hazeColor: color('#514b3b'), haze: number(1, 0, 2),
    moon: z.boolean().default(true), moonBrightness: number(1, 0, 3), moonX: number(.77, .05, .95), moonY: number(.79, .4, .95), moonSize: number(1, .3, 3),
    moonColor: color('#e6ebef'), moonGlow: number(.6, 0, 2), moonGlowRadius: number(.6, .05, 2.5)
  }).prefault({}),
  weather: z.strictObject({
    skyEnabled: z.boolean().default(true), banksEnabled: z.boolean().default(true), fogEnabled: z.boolean().default(true), rainEnabled: z.boolean().default(true),
    cloudColor: color('#242b27'), cloudCover: number(.62, 0, 1), cloudScale: number(1, .3, 3), cloudSpeed: number(1, 0, 4),
    cloudOpacity: number(.9, 0, 1), ceilingHeight: number(1200, 400, 2400),
    cloudLighting: number(.7, 0, 2), cloudLightColor: color('#89908f'),
    bankDensity: number(.65, 0, 2), bankHeight: number(390, 50, 700), bankThickness: number(150, 20, 320),
    peakDensity: number(.55, 0, 2), peakHeight: number(640, 100, 1000), peakThickness: number(155, 20, 320),
    cloudSteps: integer(4, 2, 8),
    fogColor: color('#8c8065'), fog: number(.24, 0, .8), fogHeight: number(1, .3, 3),
    shorelineHeight: number(18, 1, 80),
    streetFogEnabled: z.boolean().default(true), streetFogDensity: number(.85, 0, 2),
    streetFogDistance: number(260, 50, 1000), streetFogHeight: number(28, 3, 100), streetFogStart: number(12, 0, 100),
    endFogEnabled: z.boolean().default(true), endFogStart: number(900, 100, 2400),
    endFogFade: number(650, 50, 1800), endFogHeight: number(160, 10, 600), endFogDensity: number(1, 0, 3),
    rain: number(1, 0, 3), rainColor: color('#848978'), rainSpeed: number(1, 0, 3), wind: number(-34, -100, 100), rainLength: number(1, .3, 3)
  }).prefault({}),
  water: z.strictObject({
    enabled: z.boolean().default(true), reflectionEnabled: z.boolean().default(true),
    nearColor: color('#161d18'), farColor: color('#444536'), glintColor: color('#4b452e'),
    waveScale: number(1, .25, 3), waveSpeed: number(1, 0, 3), rippleStrength: number(1, 0, 3),
    waveHeight: number(.45, 0, 4), waveLength: number(120, 1, 400), waterLevel: number(-.2, -1000, 10),
    reflections: number(1, 0, 2), distortion: number(1, 0, 3),
    reflectionDetail: z.enum(['full', 'landmarks']).default('full'),
    skyReflection: number(.7, 0, 2), roughness: number(.32, .05, 1), rainRipples: number(.15, 0, 1)
  }).prefault({}),
  lightning: z.strictObject({
    enabled: z.boolean().default(true), style: z.enum(['forked', 'crawler', 'sheet', 'mixed']).default('mixed'),
    timing: z.enum(['automatic', 'scheduled', 'combined']).default('automatic'),
    cues: z.array(lightningCueSchema).max(maxLightningCues).refine(cues => new Set(cues.map(cue => cue.timeMs)).size === cues.length,
      'Use a different start time for each lightning cue.').default([]),
    interval: number(11, .1, 40), irregularity: number(.65, 0, 1), branches: number(.65, 0, 1),
    intensity: number(1, 0, 2), color: color('#c6d9ff'), thickness: number(1.1, .3, 3),
    duration: number(1, .5, 2), afterStrokes: integer(2, 0, 2),
    distance: number(950, 550, 2200), spread: number(.8, 0, 1),
    environment: number(.35, 0, 1.5), cloudGlow: number(.5, 0, 1.5), reflection: number(.7, 0, 1.5)
  }).prefault({}),
  cinema: z.strictObject({
    enabled: z.boolean().default(true), look: z.enum(['neutral', 'bleach', 'steel', 'amber', 'toxic']).default('neutral'),
    bloomEnabled: z.boolean().default(true), grainEnabled: z.boolean().default(true),
    lookStrength: number(.65, 0, 1), contrast: number(1.04, .6, 1.6), saturation: number(.96, 0, 1.6),
    lift: number(0, -.1, .12), grain: number(.045, 0, .3), grainSize: number(1.2, .6, 3),
    grainSpeed: number(24, 0, 30), vignette: number(.16, 0, .65),
    bloom: number(.4, 0, 1.5), bloomThreshold: number(.24, .05, 1.5), bloomRadius: number(1, .5, 3)
  }).prefault({}),
  quality: z.strictObject({ fps: integer(60, 15, 60), megapixels: number(1.3, .4, 2.4) }).prefault({})
});

// Old saved looks may contain controls from the retired city/bridge experiment.
// Strip only those known fields; misspelled settings still fail validation.
export const landscapeSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = { ...value } as Record<string, unknown>;
  delete result.road;
  for (const [group, retired] of Object.entries({
    city: ['scale', 'rotation', 'x', 'y', 'z', 'machinerySpeed'],
    landmarks: ['slopScale', 'slopX', 'slopY', 'slopZ', 'slopRotation', 'spireY', 'spireZ', 'spireRotation']
  })) {
    const original = result[group];
    if (!original || typeof original !== 'object' || Array.isArray(original)) continue;
    const fields = { ...original } as Record<string, unknown>;
    for (const key of retired) delete fields[key];
    result[group] = fields;
  }
  return result;
}, landscapeFields);

export type LandscapeConfig = z.infer<typeof landscapeSchema>;
export type LandscapeOptions = z.input<typeof landscapeFields>;
export const landscapeDefaults = landscapeSchema.parse({});

export function mergeLandscape(base: LandscapeConfig, patch: LandscapeOptions = {}): LandscapeConfig {
  // Validate the patch before spreading groups; null/arrays must not silently disappear.
  landscapeSchema.parse(patch);
  const result = { ...base, ...patch };
  for (const key of ['sequence', 'camera', 'city', 'landmarks', 'docks', 'waterThings', 'mountains', 'lighting', 'weather', 'water', 'lightning', 'cinema', 'quality'] as const) {
    Object.assign(result, { [key]: { ...base[key], ...patch[key] } });
  }
  result.sequence.garage = { ...base.sequence.garage, ...patch.sequence?.garage };
  return landscapeSchema.parse(result);
}

export { landscapeGeometryKey, seededRandom } from './landscape-math';
