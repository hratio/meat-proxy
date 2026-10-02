import type { WeaponProfile } from './weapons/profiles';
import { assetUrl } from './asset-url';

let audio: AudioContext | undefined;
let output: GainNode | undefined;
let owners = 0;
const context = () => audio ||= new AudioContext();
export { context as getAudioContext };

/** Shared output; individual sound settings and the intro mute control audibility. */
export function getAudioOutput() {
  if (!output) {
    const ctx = context();
    output = ctx.createGain();
    output.gain.setValueAtTime(1, ctx.currentTime);
    output.connect(ctx.destination);
  }
  return output;
}

/** Closing a game runtime must not cut off an opening track that still owns audio. */
export function retainAudioContext() {
  owners++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--owners === 0) closeAudioContext();
  };
}

export function closeAudioContext() {
  const previous = audio;
  audio = undefined; output = undefined;
  if (previous && previous.state !== 'closed') void previous.close().catch(() => {});
}

type Voice = { source: AudioBufferSourceNode; gain: GainNode; role: 'shot' | 'start' | 'loop' | 'stop'; startsAt: number; stopsAt?: number };
type Channel = {
  held: boolean;
  generation: number;
  shot: number;
  profile?: WeaponProfile;
  volume: number;
  timer?: ReturnType<typeof setTimeout>;
  looping: boolean;
  started: boolean;
  audible: boolean;
  voices: Set<Voice>;
};

export function createWeaponAudio(onError: (url: string) => void) {
  const downloads = new AbortController();
  const cache = new Map<string, Promise<AudioBuffer>>();
  const reported = new Set<string>();
  const channels: Channel[] = Array.from({ length: 2 }, () => ({ held: false, generation: 0, shot: 0, volume: 0, looping: false, started: false, audible: false, voices: new Set() }));
  let disposed = false;
  const load = (url: string) => {
    url = assetUrl(url);
    let pending = cache.get(url);
    if (!pending) {
      pending = fetch(url, { signal: downloads.signal }).then(response => {
        if (!response.ok) throw new Error(`Audio ${response.status}: ${url}`);
        return response.arrayBuffer();
      }).then(bytes => { downloads.signal.throwIfAborted(); return context().decodeAudioData(bytes); });
      cache.set(url, pending);
    }
    return pending;
  };
  const report = (url: string) => {
    if (!disposed && !reported.has(url)) { reported.add(url); onError(url); }
  };
  const stopVoice = (voice: Voice, ms: number) => {
    const ctx = context();
    const stopsAt = voice.startsAt > ctx.currentTime ? ctx.currentTime : ctx.currentTime + ms / 1000;
    // Explicit cancellation may shorten an existing release, never extend it.
    if (voice.stopsAt !== undefined && voice.stopsAt <= stopsAt) return;
    voice.stopsAt = stopsAt;
    // A future echo must be cancelled before its start, without a fade-in blip.
    if (voice.startsAt > ctx.currentTime) {
      voice.gain.gain.cancelScheduledValues(ctx.currentTime);
      voice.gain.gain.setValueAtTime(0, ctx.currentTime);
      voice.source.stop(ctx.currentTime);
      return;
    }
    if (typeof voice.gain.gain.cancelAndHoldAtTime === 'function') voice.gain.gain.cancelAndHoldAtTime(ctx.currentTime);
    else {
      const value = voice.gain.gain.value;
      voice.gain.gain.cancelScheduledValues(ctx.currentTime);
      voice.gain.gain.setValueAtTime(value, ctx.currentTime);
    }
    voice.gain.gain.linearRampToValueAtTime(0, stopsAt);
    voice.source.stop(stopsAt);
  };
  async function play(channel: Channel, role: Voice['role'], when?: number) {
    const profile = channel.profile;
    const url = profile?.sound[role];
    if (!profile || !url || !channel.volume) return;
    const generation = channel.generation, shot = channel.shot;
    try {
      const buffer = await load(url);
      // A slow download cannot revive a released loop, an old weapon, or a backlog of shots.
      if (disposed || generation !== channel.generation || (role === 'loop' && !channel.held) || (role === 'shot' && (shot !== channel.shot || channel.looping))) return;
      const ctx = context();
      // Missing a delayed tail is preferable to playing it seconds too late.
      if (when !== undefined && ctx.currentTime > when + 0.1) return;
      const startsAt = Math.max(ctx.currentTime, when ?? ctx.currentTime);
      const attackMs = profile.sound.attackMs ?? profile.sound.releaseMs;
      const source = ctx.createBufferSource(), gain = ctx.createGain();
      source.buffer = buffer;
      if (role === 'loop') {
        const end = profile.sound.loopEndSec || buffer.duration;
        if (profile.sound.loopStartSec >= end || end > buffer.duration + 0.001) throw new Error('Invalid loop region');
        source.loop = true; source.loopStart = profile.sound.loopStartSec; source.loopEnd = Math.min(end, buffer.duration);
        channel.looping = true;
        for (const voice of channel.voices) if (voice.role === 'shot') stopVoice(voice, attackMs);
      }
      const voice: Voice = { source, gain, role, startsAt };
      const shots = [...channel.voices].filter(item => item.role === 'shot' && item.stopsAt === undefined);
      if (role === 'shot' && shots.length >= profile.sound.maxVoices) stopVoice(shots[0], 0);
      gain.gain.setValueAtTime(role === 'loop' ? 0 : channel.volume * profile.sound.gain, startsAt);
      if (role === 'loop') gain.gain.linearRampToValueAtTime(channel.volume * profile.sound.gain, startsAt + attackMs / 1000);
      source.connect(gain); gain.connect(getAudioOutput());
      channel.voices.add(voice);
      source.onended = () => { channel.voices.delete(voice); source.disconnect(); gain.disconnect(); };
      source.start(startsAt, role === 'loop' ? profile.sound.loopStartSec : 0);
      if (role === 'shot' || role === 'loop') channel.audible = true;
    } catch { report(url); }
  }

  function end(slot: number, tail = true) {
    const channel = channels[slot];
    // Repeated releases must neither duplicate nor cancel an already queued tail.
    if (tail && !channel.held) return;
    const wasLooping = channel.looping;
    const playTail = tail && channel.audible && (wasLooping || channel.profile?.sound.stopAfter === 'shot');
    channel.held = false; channel.looping = false; channel.generation++;
    channel.started = false; channel.audible = false;
    clearTimeout(channel.timer);
    const sound = channel.profile?.sound;
    const fadeMs = (tail ? sound?.releaseMs : sound?.attackMs ?? sound?.releaseMs) ?? 0;
    for (const voice of channel.voices) {
      if (!tail || voice.role === 'loop' || voice.role === 'start') stopVoice(voice, fadeMs);
    }
    if (playTail) void play(channel, 'stop', context().currentTime + (channel.profile?.sound.stopDelayMs ?? 0) / 1000);
  }

  return {
    async preload(profiles: WeaponProfile[]) {
      if (disposed) return;
      const pending: Promise<unknown>[] = [];
      for (const profile of profiles) for (const role of ['shot', 'start', 'loop', 'stop'] as const) {
        const url = profile.sound[role];
        if (url) pending.push(load(url).catch(() => report(url)));
      }
      await Promise.all(pending);
    },
    begin(slot: number, profile: WeaponProfile, volume: number) {
      if (disposed) return;
      const channel = channels[slot];
      // Pressing during cooldown is not a shot. Leave the previous report/tail
      // playing; only a weapon change or explicit cancellation cuts it short.
      if (channel.profile !== profile || channel.volume !== volume) end(slot, false);
      else if (channel.held) end(slot);
      channel.profile = profile; channel.volume = volume; channel.held = true;
      if (!volume) return;
      // Called directly from the accepted input gesture to satisfy autoplay policy.
      void context().resume().catch(() => {});
    },
    shot(slot: number, release = false) {
      const channel = channels[slot];
      if (disposed || !channel.held || channel.looping || !channel.volume) return;
      if (release) {
        // End the hold before queuing the release shot. A normal end() after
        // play() would invalidate its pending decode and swallow the sound.
        end(slot, false);
        channel.shot++;
        void play(channel, 'shot');
        return;
      }
      if (!channel.started) {
        channel.started = true;
        void play(channel, 'start');
        const profile = channel.profile!;
        // Only an accepted shot starts audio. Holding during reload stays silent.
        if (profile.sound.loop) channel.timer = setTimeout(() => { void play(channel, 'loop'); }, profile.sound.loopDelayMs);
      }
      channel.shot++;
      void play(channel, 'shot');
    },
    end,
    dispose() {
      disposed = true;
      downloads.abort();
      channels.forEach((_, slot) => end(slot, false));
      cache.clear();
    }
  };
}

export function playSound(kind: 'shot' | 'secondary' | 'target' | 'land' | 'reload' | 'erase', volume: number) {
  if (!volume) return;
  try {
    audio = context();
    if (audio.state === 'suspended') void audio.resume();
    const time = audio.currentTime;
    const gain = audio.createGain();
    gain.connect(getAudioOutput());
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(.001, time + (kind === 'target' ? .35 : .14));
    const oscillator = audio.createOscillator();
    oscillator.type = kind === 'target' || kind === 'land' ? 'sine' : 'sawtooth';
    const frequency = kind === 'target' ? 660 : kind === 'land' ? 90 : kind === 'secondary' ? 240 : kind === 'reload' ? 100 : kind === 'erase' ? 330 : 145;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'target' ? 1320 : 40, time + .12);
    oscillator.connect(gain); oscillator.start(time); oscillator.stop(time + .4);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* Audio is decoration; browser autoplay policy never blocks a review. */ }
}
