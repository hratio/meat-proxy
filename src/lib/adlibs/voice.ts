import { getAudioContext, getAudioOutput } from '../audio';
import { assetUrl } from '../asset-url';
import type { AdlibClip } from './schema';

export type VoiceResult = 'ended' | 'cancelled' | 'skipped' | 'failed';
export type VoiceHooks = { started?: (durationMs: number) => void; ended?: (result: VoiceResult) => void };

/** Audio transport only. The game event controller decides who owns this voice. */
export function createAdlibVoice(onError: (url: string) => void) {
  const downloads = new AbortController();
  const cache = new Map<string, Promise<AudioBuffer>>(), reported = new Set<string>();
  type Playback = {
    clip: AdlibClip; hooks: VoiceHooks; buffer?: AudioBuffer; source?: AudioBufferSourceNode;
    gain?: GainNode;
    timeout?: ReturnType<typeof setTimeout>;
  };
  let current: Playback | undefined;
  let enabled = false, volume = 0, masterGain = 1, disposed = false;
  const load = (url: string) => {
    url = assetUrl(url);
    let result = cache.get(url);
    if (!result) {
      result = fetch(url, { signal: downloads.signal }).then(response => {
        if (!response.ok) throw new Error(`Audio ${response.status}: ${url}`);
        return response.arrayBuffer();
      }).then(bytes => { downloads.signal.throwIfAborted(); return getAudioContext().decodeAudioData(bytes); });
      cache.set(url, result);
      void result.catch(() => cache.delete(url));
    }
    return result;
  };
  const report = (url: string) => {
    if (!disposed && !reported.has(url)) { reported.add(url); onError(url); }
  };
  const stopSource = (p: Playback) => {
    if (!p.source || !p.gain) return;
    const source = p.source, gain = p.gain, now = getAudioContext().currentTime;
    p.source = undefined; p.gain = undefined;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + .02);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.stop(now + .02);
  };
  const finish = (p: Playback, result: VoiceResult) => {
    if (current !== p) return;
    current = undefined;
    clearTimeout(p.timeout);
    stopSource(p);
    p.hooks.ended?.(result);
  };
  const start = (p: Playback) => {
    if (current !== p || p.source || !p.buffer || !enabled || disposed) return;
    const ctx = getAudioContext(), source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = p.buffer; source.loop = false;
    gain.gain.setValueAtTime(volume * masterGain * p.clip.gain, ctx.currentTime);
    source.connect(gain); gain.connect(getAudioOutput());
    p.source = source; p.gain = gain;
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      if (current !== p || p.source !== source) return;
      p.source = undefined; p.gain = undefined;
      finish(p, 'ended');
    };
    source.start();
    p.hooks.started?.(p.buffer.duration * 1000);
  };
  return {
    get playing() { return current?.clip.id; },
    get enabled() { return enabled; },
    unlock() { if (!disposed && enabled) void getAudioContext().resume().catch(() => {}); },
    preferences(next: { enabled: boolean; volume: number; gain: number }) {
      enabled = next.enabled && next.volume > 0;
      volume = next.volume; masterGain = next.gain;
      if (!enabled && current) finish(current, 'skipped');
      else if (current?.gain) current.gain.gain.setValueAtTime(volume * masterGain * current.clip.gain, getAudioContext().currentTime);
    },
    async preload(clips: AdlibClip[]) {
      if (!enabled || disposed) return;
      await Promise.all(clips.filter(c => c.enabled).map(clip => load(clip.url).catch(() => report(clip.url))));
    },
    play(clip: AdlibClip, hooks: VoiceHooks = {}) {
      if (current) finish(current, 'cancelled');
      if (disposed || !enabled || !clip.enabled) { hooks.ended?.('skipped'); return; }
      const requestedAt = performance.now();
      const p: Playback = { clip, hooks };
      current = p;
      // A stalled decode/autoplay request settles even if its promise never does.
      p.timeout = setTimeout(() => finish(p, 'skipped'), 1000);
      void Promise.all([load(clip.url), getAudioContext().resume()]).then(([buffer]) => {
        if (current !== p || disposed) return;
        if (performance.now() - requestedAt > 1000) { finish(p, 'skipped'); return; }
        clearTimeout(p.timeout);
        p.buffer = buffer;
        start(p);
      }).catch(() => { if (current === p) { report(clip.url); finish(p, 'failed'); } });
    },
    cancel() { if (current) finish(current, 'cancelled'); },
    dispose() { disposed = true; enabled = false; if (current) finish(current, 'cancelled'); downloads.abort(); cache.clear(); }
  };
}
export type AdlibVoice = ReturnType<typeof createAdlibVoice>;
