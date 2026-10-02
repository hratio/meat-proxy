import { getAudioContext, getAudioOutput } from './audio';
import { assetUrl } from './asset-url';
import { recordedSounds } from './weapons/samples';

const flyby = recordedSounds['bullet-flyby'];
export const reviewSoundClips = {
  erase: flyby.clips.sequence,
  complete: recordedSounds['wood-impact'].clips.impact
};
const passes = reviewSoundClips.erase.segments!;

type Voice = { source: AudioBufferSourceNode; gain: GainNode; kind: 'erase' | 'complete'; startedAt: number; stopsAt?: number };
type Erase = { owners: Set<string>; generation: number; released: boolean; voice?: Voice };

export function createReviewAudio(onError: (url: string) => void) {
  const downloads = new AbortController();
  const cache = new Map<string, Promise<AudioBuffer>>();
  const reported = new Set<string>();
  const voices = new Set<Voice>();
  let erase: Erase | undefined;
  let eraseGeneration = 0, epoch = 0, disposed = false;
  const report = (url: string) => {
    if (!disposed && !reported.has(url)) { reported.add(url); onError(url); }
  };
  const load = (url: string) => {
    url = assetUrl(url);
    let buffer = cache.get(url);
    if (!buffer) {
      buffer = fetch(url, { signal: downloads.signal }).then(response => {
        if (!response.ok) throw new Error(`Audio ${response.status}: ${url}`);
        return response.arrayBuffer();
      }).then(bytes => { downloads.signal.throwIfAborted(); return getAudioContext().decodeAudioData(bytes); });
      cache.set(url, buffer);
    }
    return buffer;
  };
  const unlock = () => {
    if (!disposed) void getAudioContext().resume().catch(() => {});
  };
  const stop = (voice: Voice, at?: number) => {
    if (!voices.has(voice)) return;
    const ctx = getAudioContext(), end = Math.max(ctx.currentTime, at ?? ctx.currentTime + .012);
    if (voice.stopsAt !== undefined && voice.stopsAt <= end) return;
    voice.stopsAt = end;
    // Keep the current pass at full gain; fade only its final 12 ms.
    const fadeStart = Math.max(ctx.currentTime, end - .012);
    if (typeof voice.gain.gain.cancelAndHoldAtTime === 'function') voice.gain.gain.cancelAndHoldAtTime(fadeStart);
    else {
      const value = voice.gain.gain.value;
      voice.gain.gain.cancelScheduledValues(fadeStart);
      voice.gain.gain.setValueAtTime(value, fadeStart);
    }
    voice.gain.gain.linearRampToValueAtTime(0, end);
    voice.source.stop(end);
  };
  const play = (buffer: AudioBuffer, volume: number, kind: Voice['kind']) => {
    const ctx = getAudioContext();
    const active = [...voices].filter(voice => voice.kind === kind);
    if (active.length >= 4) stop(active[0]);
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = false;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    source.connect(gain); gain.connect(getAudioOutput());
    const voice: Voice = { source, gain, kind, startedAt: ctx.currentTime };
    voices.add(voice);
    source.onended = () => { voices.delete(voice); source.disconnect(); gain.disconnect(); };
    source.start(voice.startedAt);
    return voice;
  };
  const finishPass = (session: Erase) => {
    if (!session.voice) return;
    const ctx = getAudioContext(), elapsed = ctx.currentTime - session.voice.startedAt;
    const current = passes.find(pass => elapsed >= pass.start && elapsed < pass.end);
    const next = passes.find(pass => pass.start > elapsed);
    const end = current ? session.voice.startedAt + current.end
      : Math.min(ctx.currentTime + .012, next ? session.voice.startedAt + next.start : Infinity);
    stop(session.voice, end);
  };
  const cancel = () => {
    epoch++; eraseGeneration++;
    erase = undefined;
    for (const voice of voices) stop(voice);
  };

  return {
    unlock,
    async preload() {
      if (disposed) return;
      await Promise.all(Object.values(reviewSoundClips).map(clip => load(clip.url).catch(() => report(clip.url))));
    },
    beginErase(owner: string, volume: number) {
      if (disposed || !volume) return;
      if (erase) { erase.owners.add(owner); return; }
      const session: Erase = { owners: new Set([owner]), generation: ++eraseGeneration, released: false };
      erase = session;
      const request = epoch, url = reviewSoundClips.erase.url;
      unlock();
      void load(url).then(buffer => {
        if (disposed || request !== epoch || session.generation !== eraseGeneration) return;
        session.voice = play(buffer, volume, 'erase');
        if (session.released) finishPass(session);
      }).catch(() => report(url));
    },
    endErase(owner: string, natural = true) {
      const session = erase;
      if (!session?.owners.delete(owner) || session.owners.size) return;
      erase = undefined;
      session.released = true;
      if (natural) finishPass(session);
      else {
        eraseGeneration++;
        if (session.voice) stop(session.voice);
      }
    },
    complete(volume: number) {
      if (disposed || !volume) return;
      const request = epoch, url = reviewSoundClips.complete.url;
      unlock();
      void load(url).then(buffer => {
        if (!disposed && request === epoch) play(buffer, volume, 'complete');
      }).catch(() => report(url));
    },
    cancel,
    dispose() { cancel(); disposed = true; downloads.abort(); cache.clear(); }
  };
}
