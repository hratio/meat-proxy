import { z } from 'zod';
import { landscapeFields, landscapeSchema, type LandscapeConfig, type LightningCue } from '$lib/components/splash/landscape-config';

export type LandscapePath = { [K in keyof LandscapeConfig]: LandscapeConfig[K] extends object
  ? `${K}.${keyof LandscapeConfig[K] & string}` : K }[keyof LandscapeConfig];
type Field = { path: LandscapePath; label: string; step?: number; unit?: string };
const field = (path: LandscapePath, label: string, step?: number, unit?: string): Field => ({ path, label, step, unit });

export const landscapeGroups = [
  { id: 'city', name: 'City', description: 'The original procedural industrial skyline. Control its density, proportions and rooftop details.', fields: [
    field('city.density', 'Building density', .05), field('city.height', 'Building height', .05), field('city.width', 'Building width', .05),
    field('city.variation', 'Height variation', .05), field('city.roofDetail', 'Rooftop detail', .05)
  ] },
  { id: 'surfaces', name: 'Surfaces', description: 'Recolor the city and its Blender landmarks. Facade textures are generated live; no texture downloads needed.', fields: [
    field('city.buildingColor', 'Building metal'), field('city.trimColor', 'Structural trim'), field('city.windowColor', 'Warm windows'),
    field('city.accentColor', 'Accent lights'), field('city.beaconColor', 'Warning beacons'), field('city.pattern', 'Facade texture'),
    field('city.textureScale', 'Texture scale', .05), field('city.weathering', 'Grime and weathering', .05), field('city.metalness', 'Metal sheen', .01),
    field('city.windowBrightness', 'Window brightness', .05), field('city.windowDensity', 'Lit windows', .01), field('city.windowScale', 'Window size', .05)
  ] },
  { id: 'life', name: 'City life', description: 'Play the scene to see independent window shimmer and occasional dimming. Variation controls strength, speed controls pace, and glow spreads light around each window.', fields: [
    field('city.glow', 'Window glow and spill', .05), field('city.lightLife', 'Window variation', .05),
    field('city.lightSpeed', 'Window variation speed', .05), field('city.beaconPulse', 'Beacon pulse', .05),
    field('city.beaconBrightness', 'Beacon brightness', .1), field('city.beaconGlow', 'Beacon bloom boost', .1)
  ] },
  { id: 'landmarks', name: 'Landmarks', description: 'The original Crown Gate with SLOP CORP signs, Twisting Spire and Orbital Observatory. Edit their geometry and parented additions in Blender.', fields: [
    field('landmarks.enabled', 'Custom buildings'),
    field('landmarks.gateScale', 'Slop Corp size', .05), field('landmarks.gateX', 'Slop Corp position', 5, 'm'),
    field('landmarks.signBrightness', 'SLOP CORP display brightness', .1),
    field('landmarks.signColor', 'SLOP CORP text color'), field('landmarks.signGlow', 'SLOP CORP glow', .05),
    field('landmarks.signSpeed', 'SLOP CORP scroll speed', .1),
    field('landmarks.spireScale', 'Twisting Spire size', .05), field('landmarks.spireX', 'Twisting Spire position', 5, 'm'),
    field('landmarks.observatoryScale', 'Observatory size', .05), field('landmarks.observatoryX', 'Observatory position', 5, 'm')
  ] },
  { id: 'observatory-display', name: 'Observatory display', description: 'Lettering around the tilted orbital band. Start angle positions the first letter; optional rotation uses the same speed scale as SLOP CORP (1 = one lap per minute). Save config to keep the text, motion and independent lighting.', fields: [
    field('landmarks.observatoryText', 'Observatory text'),
    field('landmarks.observatoryTextStart', 'Observatory text start angle', 1, '°'),
    field('landmarks.observatorySignRotate', 'Rotate observatory text'),
    field('landmarks.observatorySignReverse', 'Reverse observatory rotation'),
    field('landmarks.observatorySignSpeed', 'Observatory scroll speed', .1, 'laps/min'),
    field('landmarks.observatoryTextSize', 'Observatory text height', .1, 'm'),
    field('landmarks.observatoryTextSpacing', 'Observatory letter spacing', .05, 'm'),
    field('landmarks.observatorySignBrightness', 'Observatory display brightness', .1),
    field('landmarks.observatorySignColor', 'Observatory text color'),
    field('landmarks.observatorySignGlow', 'Observatory glow', .05)
  ] },
  { id: 'harbor', name: 'Harbor', description: 'Raised industrial quay with steel retaining panels, ribs, fenders, service conduits and access ladders. The scene seed shapes the shoreline; buildings follow its elevation. Rock controls apply when the quay is off.', fields: [
    field('docks.coastVariation', 'Coastline variation', .05), field('docks.relief', 'Ground relief', .05),
    field('docks.enabled', 'Shore details'), field('docks.density', 'Rock density', .05), field('docks.scale', 'Rock size', .05),
    field('docks.quay', 'Industrial retaining quay'), field('docks.quayHeight', 'Quay ground lift', .25, 'm'),
    field('docks.panelWidth', 'Retaining panel span', .5, 'm'), field('docks.quayColor', 'Quay metal color'),
    field('docks.pier', 'Short pier'), field('docks.color', 'Ground color'), field('docks.edgeColor', 'Rock and pier color'), field('docks.lights', 'Seawall markers', .05)
  ] },
  { id: 'mountains', name: 'Mountains', description: 'Layered alpine ridges. Low parallax keeps them distant while the waterfront races past.', fields: [
    field('mountains.enabled', 'Mountain ranges'), field('mountains.height', 'Peak height', .05), field('mountains.distance', 'Mountain distance', .05),
    field('mountains.parallax', 'Mountain parallax', .01), field('mountains.ruggedness', 'Ridge ruggedness', .05),
    field('mountains.rockColor', 'Rock color'), field('mountains.snowColor', 'Snow color'), field('mountains.snowLine', 'Snow altitude', 10, 'm'), field('mountains.snowAmount', 'Snow cover', .01)
  ] },
  { id: 'light', name: 'Light & sky', description: 'Set the mood with exposure and grazing light. Moon position uses a fixed sky reference; editing or animating the camera does not move it.', fields: [
    field('lighting.exposure', 'Exposure', .01), field('lighting.temperature', 'Temperature · cool to warm', .01),
    field('lighting.keyColor', 'Key light color'), field('lighting.ambient', 'Ambient fill', .01), field('lighting.signSpill', 'Sign light on structure', .01),
    field('lighting.strength', 'Main light strength', .05), field('lighting.azimuth', 'Light direction', 1, '°'), field('lighting.elevation', 'Light elevation', 1, '°'),
    field('lighting.skyColor', 'Upper sky'), field('lighting.horizonColor', 'Horizon'), field('lighting.sunColor', 'Sunset glow'), field('lighting.sunGlow', 'Glow strength', .05),
    field('lighting.hazeColor', 'Distance haze'), field('lighting.haze', 'Haze strength', .05), field('lighting.moon', 'Moon'),
    field('lighting.moonBrightness', 'Moon core brightness', .05), field('lighting.moonX', 'Moon horizontal position', .01),
    field('lighting.moonY', 'Moon vertical position', .01), field('lighting.moonSize', 'Moon size', .05),
    field('lighting.moonColor', 'Moon light color'), field('lighting.moonGlow', 'Moon atmospheric glow', .05), field('lighting.moonGlowRadius', 'Moon glow width', .05, '× radius')
  ] },
  { id: 'weather', name: 'Weather', description: 'Shared world-space weather. Coverage sets cloud area; opacity sets their weight. Cloud lighting leaves clear sky dark. Smog attenuation distance retains 37% of light at water height when density is 1; height falloff controls how quickly it thins upward. Distances use meters. Negative wind blows from right to left.', fields: [
    field('weather.skyEnabled', 'Overhead clouds'), field('weather.banksEnabled', 'Tower cloud banks'), field('weather.fogEnabled', 'Waterfront haze'), field('weather.rainEnabled', 'Rain enabled'),
    field('weather.cloudOpacity', 'Sky cloud opacity', .01), field('weather.ceilingHeight', 'Cloud ceiling height', 25, 'm'),
    field('weather.cloudLighting', 'Light within clouds', .05), field('weather.cloudLightColor', 'Cloud illumination color'),
    field('weather.bankDensity', 'Tower bank density', .05), field('weather.bankHeight', 'Tower bank height', 5, 'm'), field('weather.bankThickness', 'Tower bank thickness', 5, 'm'),
    field('weather.peakDensity', 'Spire mist density', .05), field('weather.peakHeight', 'Spire mist height', 5, 'm'), field('weather.peakThickness', 'Spire mist thickness', 5, 'm'),
    field('weather.cloudSteps', 'Atmosphere samples · capped at 8', 1), field('weather.shorelineHeight', 'Shoreline haze height', 1, 'm'),
    field('seed', 'City and weather seed', 1),
    field('weather.cloudColor', 'Cloud color'), field('weather.cloudCover', 'Cloud cover', .01), field('weather.cloudScale', 'Cloud texture scale', .05), field('weather.cloudSpeed', 'Cloud speed', .05),
    field('weather.fogColor', 'Fog color'), field('weather.fog', 'Fog density', .01), field('weather.fogHeight', 'Fog height', .05),
    field('weather.streetFogEnabled', 'Road and district smog'), field('weather.streetFogDensity', 'Smog density', .05),
    field('weather.streetFogDistance', 'Smog attenuation distance', 10, 'm'), field('weather.streetFogHeight', 'Smog height falloff', 1, 'm'), field('weather.streetFogStart', 'Smog clear foreground', 1, 'm'),
    field('weather.endFogEnabled', 'Harbor end fog'), field('weather.endFogStart', 'End fog · clear half-width', 25, 'm'),
    field('weather.endFogFade', 'End fog · fade distance', 25, 'm'), field('weather.endFogHeight', 'End fog · height', 10, 'm'), field('weather.endFogDensity', 'End fog · density', .05),
    field('weather.rain', 'Rain amount', .05), field('weather.rainColor', 'Rain color'), field('weather.rainSpeed', 'Rain speed', .05),
    field('weather.wind', 'Wind direction and speed', 1), field('weather.rainLength', 'Rain streak length', .05)
  ] },
  { id: 'water', name: 'Water', description: 'Harbor water with broad swell and fine wind ripples. Mirrored scene geometry shares the weather. Landmark-only reflection detail reduces geometry work.', fields: [
    field('water.enabled', 'Water surface'), field('water.reflectionEnabled', 'City reflections'), field('water.reflectionDetail', 'Reflection detail'),
    field('water.skyReflection', 'Reflected sky strength', .05), field('water.roughness', 'Water roughness', .01), field('water.rainRipples', 'Near rain impacts', .01),
    field('water.nearColor', 'Near water'), field('water.farColor', 'Distant water'), field('water.glintColor', 'Wave glints'),
    field('water.waveHeight', 'Wave height', .05, 'm'), field('water.waveLength', 'Wavelength', 5, 'm'), field('water.waterLevel', 'Water level', .1, 'm'),
    field('water.waveSpeed', 'Wave speed', .05), field('water.waveScale', 'Ripple scale', .05), field('water.rippleStrength', 'Ripple strength', .05),
    field('water.reflections', 'Reflection brightness', .05), field('water.distortion', 'Reflection distortion', .05)
  ] },
  { id: 'lightning', name: 'Lightning', description: 'Set millisecond cues and place branching strikes on the water. Automatic and combined timing also use the interval controls. Test a strike live, or pause first to inspect one. Reduced motion disables flashes.', fields: [
    field('lightning.enabled', 'Lightning enabled'), field('lightning.style', 'Strike style'),
    field('lightning.timing', 'Lightning timing'), field('lightning.cues', 'Scheduled strikes'),
    field('lightning.interval', 'Strike interval', .1, 's'), field('lightning.irregularity', 'Timing irregularity', .05),
    field('lightning.branches', 'Branching', .05), field('lightning.color', 'Lightning color'), field('lightning.intensity', 'Bolt intensity', .05),
    field('lightning.thickness', 'Channel thickness', .05), field('lightning.duration', 'Stroke duration', .05), field('lightning.afterStrokes', 'Return strokes', 1),
    field('lightning.distance', 'Storm distance', 25), field('lightning.spread', 'Horizontal spread', .05),
    field('lightning.environment', 'Light on buildings and mountains', .05), field('lightning.cloudGlow', 'Cloud illumination', .05), field('lightning.reflection', 'Bolt reflection', .05)
  ] },
  { id: 'cinema', name: 'Cinema', description: 'Color grades, film grain and soft bloom. Turn down bloom or disable Cinema to reduce GPU work.', fields: [
    field('cinema.bloomEnabled', 'Bloom enabled'), field('cinema.grainEnabled', 'Grain enabled'),
    field('cinema.enabled', 'Cinematic processing'), field('cinema.look', 'Film look'), field('cinema.lookStrength', 'Look strength', .05),
    field('cinema.contrast', 'Film contrast', .01), field('cinema.saturation', 'Film saturation', .01), field('cinema.lift', 'Shadow lift', .005),
    field('cinema.grain', 'Film grain', .005), field('cinema.grainSize', 'Grain size', .1), field('cinema.grainSpeed', 'Grain cadence', 1, 'fps'),
    field('cinema.vignette', 'Lens vignette', .01), field('cinema.bloom', 'Bloom strength', .05), field('cinema.bloomThreshold', 'Bloom threshold', .01), field('cinema.bloomRadius', 'Bloom radius', .05)
  ] },
  { id: 'camera', name: 'Camera', description: 'Pan along the water, slow down and hold at the floating office debris. Negative speed reverses direction; zero shows the final framing.', fields: [
    field('speed', 'Travel speed', 1), field('camera.height', 'Camera height', 1), field('camera.distance', 'Distance from shore', 1),
    field('camera.targetHeight', 'Look-at height', 1), field('camera.fov', 'Field of view', 1, '°'), field('camera.yaw', 'Look left or right', 1, '°'),
    field('camera.roll', 'Camera roll', .5, '°'), field('camera.offset', 'Starting position', 5, 'm'),
    field('camera.panDistance', 'Pan distance', 10, 'm'), field('camera.settleSeconds', 'Slowdown duration', .1, 's')
  ] },
  { id: 'playback', name: 'Playback', description: 'Keep the backdrop subtle behind the title. Fade out begins when the main application loads. Preview fades with Replay entrance.', fields: [
    field('opacity', 'Backdrop opacity', .01), field('fadeInMs', 'Fade in', 50, 'ms'), field('fadeOutMs', 'Fade out', 50, 'ms'),
    field('quality.fps', 'Frame rate limit', 1, 'fps'), field('quality.megapixels', 'Resolution budget', .1, 'MP')
  ] }
] as const;

export type LandscapeValue = number | string | boolean | LightningCue[];

export function readLandscapeField(config: LandscapeConfig, path: LandscapePath): LandscapeValue {
  const [group, key] = path.split('.');
  const value = config[group as keyof LandscapeConfig];
  return key ? (value as unknown as Record<string, LandscapeValue>)[key] : value as LandscapeValue;
}

export function editLandscapeField(config: LandscapeConfig, path: LandscapePath, value: LandscapeValue): LandscapeConfig {
  const next = structuredClone(config), [group, key] = path.split('.');
  if (key) (next[group as keyof LandscapeConfig] as unknown as Record<string, unknown>)[key] = value;
  else Object.assign(next, { [group]: value });
  return landscapeSchema.parse(next);
}

export function describeLandscapeField(path: LandscapePath) {
  const [group, key] = path.split('.');
  let schema: z.ZodType = landscapeFields.shape[group as keyof LandscapeConfig];
  const unwrap = (value: z.ZodType): z.ZodType => value instanceof z.ZodDefault || value instanceof z.ZodPrefault ? unwrap(value.unwrap() as z.ZodType) : value;
  schema = unwrap(schema);
  if (key && schema instanceof z.ZodObject) schema = unwrap(schema.shape[key]);
  if (schema instanceof z.ZodNumber) return { kind: 'number' as const, min: schema.minValue!, max: Number(schema.meta()?.sliderMax ?? 100) };
  if (schema instanceof z.ZodBoolean) return { kind: 'toggle' as const };
  if (schema instanceof z.ZodEnum) return { kind: 'select' as const, options: schema.options as string[] };
  if (schema instanceof z.ZodArray && path === 'lightning.cues') return { kind: 'cues' as const };
  if (schema instanceof z.ZodString && path === 'landmarks.observatoryText') return { kind: 'text' as const, maxLength: schema.maxLength! };
  return { kind: 'color' as const };
}
