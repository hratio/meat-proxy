import authoredCues from './splash2-subtitle-cues.json';
import type { Splash2Audio } from './splash2-audio-config';

export const subtitleFonts = ['inter', 'oxanium', 'mono'] as const;
export type SubtitleFont = typeof subtitleFonts[number];
export interface SubtitleCue { id: string; startMs: number; endMs: number; text: string }
export interface Splash2Subtitles {
  enabled: boolean; font: SubtitleFont; fontSize: number; color: string;
  opacity: number; tracking: number; bottom: number; offsetMs: number;
  /** Milliseconds in the source recording, before audio start/trim adjustments. */
  cues: SubtitleCue[];
}
export const subtitleFontFamilies: Record<SubtitleFont, string> = {
  inter: "'Inter Variable', Inter, sans-serif",
  oxanium: "'Oxanium Variable', Oxanium, sans-serif",
  mono: "'IBM Plex Mono', monospace"
};
export const defaultSplash2Subtitles: Splash2Subtitles = {
  enabled: true, font: 'inter', fontSize: 14, color: '#c6cbd1', opacity: .72,
  tracking: .025, bottom: 5.5, offsetMs: 0, cues: authoredCues
};
export function resolveSplash2Subtitles(options: Partial<Splash2Subtitles> = {}): Splash2Subtitles {
  return { ...defaultSplash2Subtitles, ...options,
    cues: (options.cues ?? defaultSplash2Subtitles.cues).map(cue => ({ ...cue })).sort((a,b) => a.startMs-b.startMs) };
}
export function subtitleSourceTime(time: number, audio: Pick<Splash2Audio, 'at' | 'offset'>, offsetMs: number) {
  return time - audio.at + audio.offset - offsetMs;
}
export function subtitleTimelineTime(sourceMs: number, audio: Pick<Splash2Audio, 'at' | 'offset'>, offsetMs: number) {
  return sourceMs + audio.at - audio.offset + offsetMs;
}
/** Pure sampling keeps mute, pause, reverse scrubbing and skipped openings aligned. */
export function sampleSubtitle(time: number, settings: Splash2Subtitles, audio: Pick<Splash2Audio, 'at' | 'offset'>) {
  if (!settings.enabled || time < audio.at || !Number.isFinite(time)) return undefined;
  const sourceMs = subtitleSourceTime(time, audio, settings.offsetMs);
  return settings.cues.find(cue => sourceMs >= cue.startMs && sourceMs < cue.endMs);
}
