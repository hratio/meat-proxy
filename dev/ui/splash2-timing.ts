import originalTiming from '../assets/recipes/splash2/original-timing.json';
import { splash2LayerNames, splash2LayerImpactAt, type Splash2Config, type Splash2LayerName, type Splash2Timing } from '../../src/lib/components/splash/splash2-playback-config';

export interface Splash2TimingPreset {
  name: string;
  hint: string;
  timing: Partial<Splash2Timing>;
}

/** Put the actual landing on each beat, accounting for the authored entrance. */
function pulse(config: Splash2Config, beat: number, [pylons, backgroundRing, secondRing, frameLogo, reviewerVerdict, caption]: [number, number, number, number, number, number]) {
  const timing: Partial<Splash2Timing> = {};
  const cue = (name: Splash2LayerName, step: number, duration: number) => {
    const contact = splash2LayerImpactAt({ ...config, openingDelay: 0, timing: { ...config.timing, [`${name}At`]: 0, [`${name}Duration`]: duration } }, name);
    timing[`${name}At`] = Math.round(1000 + step * beat - contact);
    timing[`${name}Duration`] = duration;
  };
  cue('pylonLeft', 0, pylons); cue('pylonRight', 0, pylons);
  cue('background', 1, backgroundRing); cue('firstRing', 1, backgroundRing);
  cue('secondRing', 2, secondRing); cue('mainFrame', 2, frameLogo);
  cue('logo', 3, frameLogo); cue('dude', 4, reviewerVerdict);
  // Let the caption appear with the reviewer's hit without delaying the build.
  if (config.motion.subtitleText.entrance === 'fade') {
    timing.subtitleTextAt = 1000 + 4 * beat; timing.subtitleTextDuration = caption;
  } else cue('subtitleText', 4, caption);
  // One empty beat lets the face and title register before the final verdict.
  cue('lgtm', 6, reviewerVerdict);
  return timing;
}

export function timingPresets(config: Splash2Config): Splash2TimingPreset[] {
  return [
    { name: 'Your original timing', hint: 'Restore your timing from before these presets', timing: originalTiming },
    { name: 'Heavy pulse', hint: 'Recommended · 120 BPM · chunky half-second hits', timing: pulse(config, 500, [350, 300, 250, 350, 450, 220]) },
    { name: 'Faster pulse', hint: '150 BPM · tighter 400 ms hits', timing: pulse(config, 400, [300, 250, 220, 300, 400, 180]) }
  ];
}

/** Change timing only; custom drift clocks and all other artwork settings survive. */
export function applyTimingPreset(config: Splash2Config, preset: Splash2TimingPreset) {
  config.timing = { ...config.timing, ...preset.timing };
}

export function timingPresetMatches(config: Splash2Config, preset: Splash2TimingPreset) {
  return Object.entries(preset.timing).every(([key, value]) => config.timing[key as keyof Splash2Timing] === value);
}

export function timingLandings(config: Splash2Config) {
  return splash2LayerNames.map(name => ({ name, at: splash2LayerImpactAt(config, name) })).sort((a, b) => a.at - b.at);
}
