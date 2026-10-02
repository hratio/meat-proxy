import { assetUrl } from '../../asset-url';
import { getAudioContext, getAudioOutput, retainAudioContext } from '../../audio';
import { splash2AudioWindow, type Splash2Audio, type Splash2AudioAnchors } from './splash2-audio-config';

type Voice = { source: AudioBufferSourceNode; attack: GainNode; release: GainNode; stopsAt: number };

/** One opening recording, owned beyond the splash and synced to its playhead. */
export function createSplash2Audio() {
  const releaseAudio = retainAudioContext();
  const downloads = new AbortController();
  const cache = new Map<string, Promise<AudioBuffer | undefined>>();
  let buffer: AudioBuffer | undefined, voice: Voice | undefined;
  let settings: Splash2Audio, generation = 0, ready = false, disposed = false;
  let playing = false, scheduled = false, time = 0, volume = 1, origin = 0;
  let autoplayTried = false;
  let muted = false, muteGain: GainNode | undefined;
  let anchors: Splash2AudioAnchors = {};

  function openingOutput() {
    if (!muteGain) {
      const ctx = getAudioContext();
      muteGain = ctx.createGain();
      muteGain.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
      muteGain.connect(getAudioOutput());
    }
    return muteGain;
  }
  function setMuted(value: boolean) {
    if (disposed || muted === value) return;
    muted = value;
    if (!muteGain) return;
    const now = getAudioContext().currentTime, gain = muteGain.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else { gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now); }
    gain.linearRampToValueAtTime(muted ? 0 : 1, now + .08);
  }

  const load = (url: string) => {
    url = assetUrl(url);
    let pending = cache.get(url);
    if (!pending) {
      pending = fetch(url, { signal: AbortSignal.any([downloads.signal, AbortSignal.timeout(15000)]) })
        .then(async response => {
          if (!response.ok) throw new Error(`Audio ${response.status}`);
          const bytes = await response.arrayBuffer();
          downloads.signal.throwIfAborted();
          return getAudioContext().decodeAudioData(bytes);
        }).catch(() => { cache.delete(url); return undefined; });
      cache.set(url, pending);
    }
    return pending;
  };
  function remove(ended: Voice) {
    if (voice === ended) voice = undefined;
    ended.source.disconnect(); ended.attack.disconnect(); ended.release.disconnect();
  }
  function stop() {
    if (voice) {
      const now = getAudioContext().currentTime;
      voice.release.gain.cancelScheduledValues(now);
      voice.release.gain.setValueAtTime(0, now);
      voice.source.stop(now);
      voice = undefined;
    }
    scheduled = false;
  }
  function fade(current: Voice, timeline: number) {
    const window = splash2AudioWindow(settings, buffer!.duration * 1000, anchors);
    const ctx = getAudioContext(), start = Math.max(ctx.currentTime, origin + settings.at / 1000);
    const value = timeline < window.fadeAt ? 1 : window.end <= window.fadeAt ? 0 : Math.max(0, (window.end - timeline) / (window.end - window.fadeAt));
    current.release.gain.cancelScheduledValues(start);
    current.release.gain.setValueAtTime(value, start);
    if (timeline < window.fadeAt) current.release.gain.setValueAtTime(1, origin + window.fadeAt / 1000);
    const end = Math.max(start, origin + window.end / 1000);
    current.release.gain.linearRampToValueAtTime(0, end);
    // An event can shorten the natural tail; it cannot extend the file itself.
    if (end < current.stopsAt) { current.source.stop(end); current.stopsAt = end; }
  }
  function schedule() {
    const ctx = getAudioContext();
    if (ctx.state !== 'running' || !ready || !playing || disposed) return;
    stop(); origin = ctx.currentTime - time / 1000; scheduled = true;
    if (!settings.enabled || !buffer) return;
    const window = splash2AudioWindow(settings, buffer.duration * 1000, anchors);
    if (time >= window.end || settings.offset >= buffer.duration * 1000) return;
    const source = ctx.createBufferSource(), attack = ctx.createGain(), release = ctx.createGain();
    source.buffer = buffer;
    const from = Math.max(time, settings.at), start = origin + from / 1000;
    const attackLevel = settings.fadeIn ? Math.min(1, (from - settings.at) / settings.fadeIn) : 1;
    attack.gain.setValueAtTime(settings.volume * volume * attackLevel, start);
    if (from < settings.at + settings.fadeIn) attack.gain.linearRampToValueAtTime(settings.volume * volume, origin + (settings.at + settings.fadeIn) / 1000);
    source.connect(attack); attack.connect(release); release.connect(openingOutput());
    const current = { source, attack, release, stopsAt: origin + window.end / 1000 };
    voice = current; source.onended = () => remove(current);
    fade(current, from);
    source.start(start, (settings.offset + from - settings.at) / 1000);
    source.stop(current.stopsAt);
  }
  const unlock = () => {
    if (disposed || !playing || !ready || !buffer) return;
    // Autoplay denial never holds the visuals. A normal later gesture joins the
    // current playhead rather than replaying the beginning over the game.
    void getAudioContext().resume().catch(() => {});
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }
  return {
    async prepare(next: Splash2Audio, sound = true) {
      const request = ++generation;
      ready = false; autoplayTried = false; stop(); buffer = undefined; settings = next;
      const loaded = sound && next.enabled ? await load(next.url) : undefined;
      if (disposed || request !== generation) return { duration: 0, failed: false };
      buffer = loaded; ready = true;
      return { duration: (buffer?.duration ?? 0) * 1000, failed: sound && next.enabled && !buffer };
    },
    sync(at: number, active: boolean, masterVolume = 1) {
      if (disposed) return;
      const wasPlaying = playing, volumeChanged = volume !== masterVolume;
      time = at; playing = active; volume = masterVolume;
      if (!playing) { if (scheduled) stop(); return; }
      if (!ready || !buffer) return;
      if (!wasPlaying || !autoplayTried) { autoplayTried = true; unlock(); }
      const ctx = getAudioContext();
      if (ctx.state !== 'running') { if (scheduled) stop(); return; }
      if (!scheduled || volumeChanged || Math.abs((ctx.currentTime - origin) * 1000 - time) > 180) schedule();
    },
    /** Authoring overview, sampled once after decoding, never during playback. */
    waveform(bins = 180) {
      if (!buffer) return [];
      const samples = buffer.getChannelData(0), size = Math.ceil(samples.length / bins);
      return Array.from({ length: bins }, (_, bin) => {
        let peak = 0;
        for (let i = bin * size; i < Math.min(samples.length, (bin+1)*size); i += 8) peak = Math.max(peak, Math.abs(samples[i]));
        return peak;
      });
    },
    anchors(next: Splash2AudioAnchors) {
      if (anchors.handoff === next.handoff && anchors.game === next.game) return;
      anchors = next;
      if (scheduled && voice) fade(voice, Math.max(time, settings.at));
    },
    unlock,
    /** The intro mute affects only this recording, including its gameplay tail. */
    setMuted,
    dispose() {
      if (disposed) return;
      disposed = true; generation++; downloads.abort(); stop(); buffer = undefined; cache.clear();
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock);
      }
      muteGain?.disconnect(); muteGain = undefined;
      releaseAudio();
    }
  };
}
