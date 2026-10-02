export type Splash2Audio = {
  url: string;
  enabled: boolean;
  /** All timeline values and the source offset use milliseconds. */
  at: number;
  offset: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  end: 'clip' | 'time' | 'handoff' | 'game';
  /** Fade-out start on the timeline, or delay after handoff/gameplay. */
  endAt: number;
};
export type Splash2AudioOptions = Partial<Splash2Audio>;
export const defaultSplash2Audio: Splash2Audio = {
  url: '/audio/opening/opening.ogg', enabled: true, at: 0, offset: 0, volume: .8, fadeIn: 0, fadeOut: 120, end: 'clip', endAt: 0
};
export function resolveSplash2Audio(options: Splash2AudioOptions = {}): Splash2Audio {
  return { ...defaultSplash2Audio, ...options };
}
export type Splash2AudioAnchors = { handoff?: number; game?: number };

export function splash2AudioWindow(track: Splash2Audio, length: number, anchors: Splash2AudioAnchors = {}) {
  const naturalEnd = track.at + Math.max(0, length - track.offset);
  const anchor = track.end === 'handoff' ? anchors.handoff : track.end === 'game' ? anchors.game : 0;
  const fadeAt = track.end === 'clip' || anchor === undefined
    ? Math.max(track.at, naturalEnd - track.fadeOut)
    : Math.max(track.at, anchor + track.endAt);
  const end = Math.min(naturalEnd, fadeAt + track.fadeOut);
  return { fadeAt: Math.min(fadeAt, end), end };
}

/** The preview includes the audio tail after the simulated game handoff. */
export function splash2AudioEnd(audio: Splash2Audio, duration: number, anchors: Splash2AudioAnchors) {
  return audio.enabled && duration > 0 ? splash2AudioWindow(audio, duration, anchors).end : 0;
}
