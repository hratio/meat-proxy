import preset from './splash2.json';
import { resolveSplash2Subtitles, type Splash2Subtitles } from './splash2-subtitles';
import { introductionDefaults, type IntroductionConfig } from '../../introduction/config';
import { resolveSplash2Audio, type Splash2Audio, type Splash2AudioOptions } from './splash2-audio-config';
export * from './splash2-audio-config';
/** Offsets refer to the full composition canvas, retaining transparent margins. */
export interface SplashLayer {
  x: number; y: number; scale: number; rotation: number;
}

export const splash2LayerNames = ['background', 'pylonLeft', 'pylonRight', 'firstRing', 'secondRing', 'dude', 'mainFrame', 'logo', 'subtitleText', 'lgtm'] as const;
export type Splash2LayerName = typeof splash2LayerNames[number];
export const splash2PortraitNames = ['version1', 'version2'] as const;
export type Splash2Portrait = typeof splash2PortraitNames[number];
export const splash2Entrances = ['fade', 'left', 'right', 'top', 'bottom', 'stamp'] as const;
export type Splash2Entrance = typeof splash2Entrances[number];
export type Splash2Timing = Record<`${Splash2LayerName}At` | `${Splash2LayerName}Duration`, number> & { hold: number; fadeOut: number; loopGap: number };
export const splash2TimingNames: (keyof Splash2Timing)[] = [
  ...splash2LayerNames.flatMap(name => [`${name}At`, `${name}Duration`] as const), 'hold', 'fadeOut', 'loopGap'
];
export interface Splash2Motion {
  entrance: Splash2Entrance; distance: number; punch: number;
  /** Legacy authoring values, used to migrate configurations saved before grouped drift. */
  driftX: number; driftY: number;
}
export const splash2DriftPartNames = ['background', 'structure', 'dude', 'title', 'lgtm'] as const;
export type Splash2DriftPart = typeof splash2DriftPartNames[number];
export const splash2DriftMembers = {
  background: ['background'], structure: ['pylonLeft', 'pylonRight', 'firstRing', 'secondRing'],
  dude: ['dude'], title: ['mainFrame', 'logo', 'subtitleText'], lgtm: ['lgtm']
} as const satisfies Record<Splash2DriftPart, readonly Splash2LayerName[]>;
export function splash2DriftPart(name: Splash2LayerName): Splash2DriftPart {
  return splash2DriftPartNames.find(part => (splash2DriftMembers[part] as readonly Splash2LayerName[]).includes(name))!;
}
export interface Splash2Drift {
  start: 'assembled' | 'time';
  at: number;
  parts: Record<Splash2DriftPart, { x: number; y: number }>;
}
export interface Splash2ColorGrade {
  temperature: number; amberReduction: number; warmShift: number; warmHue: number;
  shadowBlue: number; saturation: number; exposure: number; contrast: number;
}
export const neutralSplash2Grade: Splash2ColorGrade = {
  temperature: 0, amberReduction: 0, warmShift: 0, warmHue: 350,
  shadowBlue: 0, saturation: 0, exposure: 0, contrast: 0
};
export interface Splash2Config {
  portrait: Splash2Portrait;
  /** Delay the complete artwork rhythm relative to the opening/audio clock. */
  openingDelay: number;
  /** Audio/title destination for Skip; the landscape keeps its own playhead. */
  skipTo: number;
  introduction: IntroductionConfig;
  audio: Splash2Audio;
  subtitles: Splash2Subtitles;
  timing: Splash2Timing;
  layers: Record<Splash2LayerName, SplashLayer>;
  motion: Record<Splash2LayerName, Splash2Motion>;
  drift: Splash2Drift;
  /** Authoring recipe. Runtime images contain the baked colors. */
  color: Record<Splash2LayerName, Splash2ColorGrade>;
  impact: number;
  scene: { enabled: boolean; speed: number; opacity: number; fadeInMs: number; fadeOutMs: number };
}
export type Splash2Options = {
  portrait?: Splash2Portrait;
  openingDelay?: number;
  skipTo?: number;
  introduction?: Partial<IntroductionConfig>;
  audio?: Splash2AudioOptions;
  subtitles?: Partial<Splash2Subtitles>;
  timing?: Partial<Splash2Timing>;
  layers?: Partial<Record<Splash2LayerName, Partial<SplashLayer>>>;
  motion?: Partial<Record<Splash2LayerName, Partial<Splash2Motion>>>;
  drift?: { start?: Splash2Drift['start']; at?: number; parts?: Partial<Record<Splash2DriftPart, Partial<{ x: number; y: number }>>> };
  color?: Partial<Record<Splash2LayerName, Partial<Splash2ColorGrade>>>;
  impact?: number;
  scene?: Partial<Splash2Config['scene']>;
};
export const defaultSplash2Config = {
  ...preset,
  introduction: { ...introductionDefaults, ...(preset as Partial<Splash2Config>).introduction },
  openingDelay: (preset as Partial<Splash2Config>).openingDelay ?? 0,
  skipTo: (preset as Partial<Splash2Config>).skipTo ?? preset.openingDelay ?? 0,
  audio: resolveSplash2Audio((preset as Partial<Splash2Config>).audio),
  subtitles: resolveSplash2Subtitles((preset as Partial<Splash2Config>).subtitles),
  motion: Object.fromEntries(splash2LayerNames.map(name => [name, { ...preset.motion[name], driftX: (preset.motion[name] as Partial<Splash2Motion>).driftX ?? 0, driftY: (preset.motion[name] as Partial<Splash2Motion>).driftY ?? 0 }])),
  drift: {
    start: (preset as Partial<Splash2Config>).drift?.start ?? 'assembled',
    at: (preset as Partial<Splash2Config>).drift?.at ?? 0,
    parts: Object.fromEntries(splash2DriftPartNames.map(part => {
      const anchor = preset.motion[splash2DriftMembers[part][0]] as Partial<Splash2Motion>;
      return [part, { x: anchor.driftX ?? 0, y: anchor.driftY ?? 0, ...(preset as Partial<Splash2Config>).drift?.parts[part] }];
    }))
  },
  color: Object.fromEntries(splash2LayerNames.map(name => [name, { ...neutralSplash2Grade, ...(preset as Partial<Splash2Config>).color?.[name] }]))
} as Splash2Config;
export function resolveSplash2Config(options: Splash2Options = {}): Splash2Config {
  const motion = Object.fromEntries(splash2LayerNames.map(name => [name, { ...defaultSplash2Config.motion[name], ...options.motion?.[name] }])) as Splash2Config['motion'];
  const parts = Object.fromEntries(splash2DriftPartNames.map(part => {
    const anchor = splash2DriftMembers[part][0];
    // Older saved files migrate their background/left-pylon/reviewer/main-frame
    // drift into one rate for each rigid assembly, without touching entrances.
    const inherited = options.motion?.[anchor];
    return [part, {
      x: inherited?.driftX ?? defaultSplash2Config.drift.parts[part].x,
      y: inherited?.driftY ?? defaultSplash2Config.drift.parts[part].y,
      ...options.drift?.parts?.[part]
    }];
  })) as Splash2Drift['parts'];
  return {
    introduction: { ...defaultSplash2Config.introduction, ...options.introduction },
    portrait: options.portrait ?? defaultSplash2Config.portrait,
    openingDelay: options.openingDelay ?? defaultSplash2Config.openingDelay,
    skipTo: options.skipTo ?? options.openingDelay ?? defaultSplash2Config.skipTo,
    audio: resolveSplash2Audio({ ...defaultSplash2Config.audio, ...options.audio }),
    subtitles: resolveSplash2Subtitles({ ...defaultSplash2Config.subtitles, ...options.subtitles }),
    timing: Object.fromEntries(splash2TimingNames.map(key => [key, options.timing?.[key] ?? defaultSplash2Config.timing[key]])) as Splash2Timing,
    scene: { ...defaultSplash2Config.scene, ...options.scene },
    impact: options.impact ?? defaultSplash2Config.impact,
    layers: Object.fromEntries(splash2LayerNames.map(name => [name, { ...defaultSplash2Config.layers[name], ...options.layers?.[name] }])) as Splash2Config['layers'],
    motion,
    drift: { start: options.drift?.start ?? defaultSplash2Config.drift.start, at: options.drift?.at ?? defaultSplash2Config.drift.at, parts },
    color: Object.fromEntries(splash2LayerNames.map(name => [name, { ...defaultSplash2Config.color[name], ...options.color?.[name] }])) as Splash2Config['color']
  };
}
/** Always leave the complete title reveal after the skip destination. */
export function splash2SkipTime(config: Splash2Config) {
  return Math.max(0, Math.min(config.skipTo, config.openingDelay));
}

/** Exclude the final verdict stamp: every earlier piece must have fully settled. */
export function splash2ArtworkReadyAt(config: Splash2Config) {
  return config.openingDelay + Math.max(...splash2LayerNames.filter(name => name !== 'lgtm').map(name => config.timing[`${name}At`] + config.timing[`${name}Duration`]));
}
export function splash2DriftStartsAt(config: Splash2Config) {
  return config.drift.start === 'assembled' ? splash2ArtworkReadyAt(config) : config.openingDelay + config.drift.at;
}
/** Impact occurs at stamp contact or near the end of a slide; fades finish quietly. */
export function splash2LayerImpactAt(config: Splash2Config, name: Splash2LayerName) {
  const entrance = config.motion[name].entrance;
  return config.openingDelay + config.timing[`${name}At`] + config.timing[`${name}Duration`] * (entrance === 'stamp' ? .48 : entrance === 'fade' ? 1 : .9);
}
export function splash2ReviewerLandsAt(config: Splash2Config) {
  return config.openingDelay + config.timing.dudeAt + config.timing.dudeDuration * (config.motion.dude.entrance === 'stamp' ? .48 : 1);
}
export function splash2Durations(config: Splash2Config) {
  const assembled = config.openingDelay + Math.max(...splash2LayerNames.map(name => config.timing[`${name}At`] + config.timing[`${name}Duration`]));
  const complete = assembled + config.timing.hold;
  return { assembled, complete, cycle: Math.max(1, complete + Math.max(config.introduction.exitMs, config.scene.enabled ? config.scene.fadeOutMs : 0) + config.timing.loopGap) };
}
