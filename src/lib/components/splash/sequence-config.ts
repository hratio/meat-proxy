import { z } from 'zod';

const point = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const cameraBeatSchema = z.strictObject({
  id: z.string().min(1).max(64), name: z.string().min(1).max(80),
  atMs: z.number().int().min(0).max(600000),
  space: z.enum(['car', 'world']).default('car'),
  position: point,
  target: z.enum(['car-direction', 'driver', 'monitor', 'chair', 'observatory', 'corporate', 'city', 'point']).default('city'),
  lookAt: point.default([0, 0, 0]),
  fov: z.number().min(15).max(110).default(55),
  roll: z.number().min(-45).max(45).default(0),
  easing: z.enum(['smooth', 'linear', 'cut']).default('smooth')
});
export const featuredPropSchema = z.strictObject({
  id: z.enum(['monitor', 'chair']),
  x: z.number().finite(), z: z.number().finite(),
  scale: z.number().min(.1).max(20).default(3),
  yaw: z.number().min(-360).max(360).default(-90),
  height: z.number().min(-10).max(10).default(0),
  light: z.number().min(0).max(4).default(1)
});
export const garageSchema = z.strictObject({
  enabled: z.boolean().default(false),
  entryOffsetMs: z.number().int().min(-300000).max(300000).default(-1100),
  distanceOffset: z.number().min(-500).max(500).default(0),
  lateralOffset: z.number().min(-30).max(30).default(0),
  heightOffset: z.number().min(-10).max(20).default(0),
  width: z.number().min(5).max(40).default(10),
  height: z.number().min(3).max(12).default(5.5),
  depth: z.number().min(25).max(200).default(80),
  openOffsetMs: z.number().int().min(-30000).max(30000).default(-4500),
  openDurationMs: z.number().int().min(200).max(20000).default(2400),
  holdCamera: z.boolean().default(true),
  holdOffsetMs: z.number().int().min(0).max(10000).default(1100),
  fade: z.boolean().default(true),
  fadeOffsetMs: z.number().int().min(0).max(10000).default(150),
  fadeDurationMs: z.number().int().min(0).max(10000).default(1400)
});
export type GarageConfig = z.infer<typeof garageSchema>;
export const drivingSequenceSchema = z.strictObject({
  enabled: z.boolean().default(false),
  durationMs: z.number().int().min(1000).max(600000).default(60000),
  titleAtMs: z.number().int().min(0).max(600000).default(60000),
  // Legacy edits retain their pan-distance/braking behavior. Cruise uses m and km/h.
  travelMode: z.enum(['pan', 'cruise']).default('pan'),
  startX: z.number().min(-10000).max(10000).default(0),
  speedKph: z.number().min(1).max(200).default(100),
  continueDriving: z.boolean().default(false),
  seatLocked: z.boolean().default(false),
  seatPosition: point.default([.10, 1.09, -.56]),
  garage: garageSchema.prefault({}),
  panoramicRoof: z.boolean().default(false),
  cabin: z.boolean().default(true), road: z.boolean().default(true),
  roadWidth: z.number().min(3).max(30).default(6),
  shoulder: z.number().min(.2).max(10).default(1.2),
  cabinLight: z.number().min(0).max(4).default(0), cabinBlackout: z.boolean().default(true), driverVisible: z.boolean().default(false),
  glassTint: z.number().min(0).max(1).default(.7), glassReflection: z.number().min(0).max(1).default(.35),
  bank: z.boolean().default(true), bankBuildings: z.number().min(0).max(2).default(1),
  bridge: z.boolean().default(true), junctionAtMs: z.number().int().min(0).max(600000).default(40000),
  turnRadius: z.number().min(35).max(180).default(65), bridgeRise: z.number().min(2).max(40).default(16),
  bridgeApproach: z.number().min(40).max(600).default(220),
  roadLights: z.number().min(0).max(4).default(1), lampSpacing: z.number().min(16).max(80).default(28),
  roadLightRadius: z.number().min(4).max(24).default(11),
  roadLightColor: z.string().regex(/^#[\da-fA-F]{6}$/).default('#e6dcc7'),
  frames: z.array(cameraBeatSchema).max(64).default([]),
  props: z.array(featuredPropSchema).max(2).default([])
}).superRefine((value, ctx) => {
  const problem = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (value.enabled && value.frames.length < 2) problem('A driving sequence needs at least two camera beats.');
  if (value.enabled && !value.frames.some(frame => frame.atMs === 0)) problem('The first camera beat must start at 0 ms.');
  if (new Set(value.frames.map(frame => frame.id)).size !== value.frames.length) problem('Camera beat IDs must be unique.');
  if (new Set(value.frames.map(frame => frame.atMs)).size !== value.frames.length) problem('Camera beats need distinct arrival times.');
  if (value.frames.some(frame => frame.atMs > value.durationMs)) problem('Camera beats must fit inside the sequence duration.');
  if (new Set(value.props.map(prop => prop.id)).size !== value.props.length) problem('Use one featured monitor and one featured chair.');
  if (value.enabled && value.frames.some(frame => ['monitor', 'chair'].includes(frame.target) && !value.props.some(prop => prop.id === frame.target))) problem('Add the featured prop before targeting it.');
  if (value.frames.some(frame => frame.target === 'car-direction' && Math.hypot(...frame.lookAt) < .001)) problem('A car viewing direction must have a nonzero length.');
});
export type CameraBeat = z.infer<typeof cameraBeatSchema>;
export type FeaturedProp = z.infer<typeof featuredPropSchema>;
export type DrivingSequence = z.infer<typeof drivingSequenceSchema>;
