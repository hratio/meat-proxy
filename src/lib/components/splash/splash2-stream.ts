import { assetUrl } from '../../asset-url';
import { getAudioContext, getAudioOutput, retainAudioContext } from '../../audio';
import { splash2AudioWindow, type Splash2Audio, type Splash2AudioAnchors } from './splash2-audio-config';

export const openingBufferSeconds = 10;
type Graph = { source: MediaElementAudioSourceNode; level: GainNode; mute: GainNode };
type Prepared = { duration: number; failed: boolean };

/** Runtime playback buffers a short lead and lets the browser stream the rest. */
export function createSplash2Stream() {
  const releaseAudio = retainAudioContext();
  let media: HTMLAudioElement | undefined, graph: Graph | undefined;
  let holdEnding = false;
  let settings: Splash2Audio, anchors: Splash2AudioAnchors = {};
  let generation = 0, playRequest = 0, cancelPrepare: (() => void) | undefined;
  let duration = 0, time = 0, volume = 1, lastLevel = -1;
  let ready = false, failed = false, disposed = false, playing = false;
  let attempted = false, pending = false, driven = false, blocked = false, muted = false;

  function ramp(node: GainNode, value: number, seconds: number) {
    const now = getAudioContext().currentTime, gain = node.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else { gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now); }
    gain.linearRampToValueAtTime(value, now + seconds);
  }
  function output() {
    if (!graph) {
      const ctx = getAudioContext(), source = ctx.createMediaElementSource(media!);
      const level = ctx.createGain(), mute = ctx.createGain();
      level.gain.setValueAtTime(0, ctx.currentTime);
      mute.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
      source.connect(level); level.connect(mute); mute.connect(getAudioOutput());
      graph = { source, level, mute }; lastLevel = -1;
    }
    return graph;
  }
  function pause() {
    playRequest++; pending = driven = false;
    if (media && !media.paused) media.pause();
  }
  function clearMedia() {
    pause();
    const previous = media; media = undefined;
    if (previous) { previous.removeAttribute('src'); previous.load(); }
    if (graph) { graph.source.disconnect(); graph.level.disconnect(); graph.mute.disconnect(); graph = undefined; }
  }
  function setMuted(value: boolean) {
    if (disposed || muted === value) return;
    muted = value;
    if (graph) ramp(graph.mute, muted ? 0 : 1, .08);
  }
  function envelope() {
    if (!graph) return;
    const window = splash2AudioWindow(holdEnding ? { ...settings, end: 'clip' } : settings, duration, anchors);
    const attack = settings.fadeIn ? Math.max(0, Math.min(1, (time - settings.at) / settings.fadeIn)) : 1;
    const release = time < window.fadeAt ? 1 : window.end <= window.fadeAt ? 0 : Math.max(0, (window.end - time) / (window.end - window.fadeAt));
    const level = settings.volume * volume * attack * release;
    if (level !== lastLevel) { ramp(graph.level, level, .02); lastLevel = level; }
  }
  function attempt() {
    if (disposed || !playing || !ready || failed || !media) return;
    const window = splash2AudioWindow(holdEnding ? { ...settings, end: 'clip' } : settings, duration, anchors);
    if (time < settings.at || time >= window.end) return;
    const current = media, ctx = getAudioContext();
    if (pending) {
      // A gesture can arrive while an earlier autoplay resume is suspended.
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
      return;
    }
    if (driven && !current.paused && ctx.state === 'running') return;
    output(); envelope();
    const target = (settings.offset + Math.max(0, time - settings.at)) / 1000;
    if (Math.abs(current.currentTime - target) > .01) current.currentTime = target;
    attempted = pending = driven = true; blocked = false;
    const request = ++playRequest;
    // Native play can resolve before Web Audio has resumed. Await both so a
    // Skip/unmute gesture cannot pause the recording again during that gap.
    void Promise.all([ctx.resume(), Promise.resolve(current.play())]).then(() => {
      if (disposed || media !== current || request !== playRequest) return;
      pending = false;
      if (ctx.state !== 'running') { blocked = true; driven = false; current.pause(); }
    }).catch(error => {
      if (disposed || media !== current || request !== playRequest) return;
      pending = driven = false;
      // Autoplay denial leaves the visual clock free to run. A later ordinary
      // interaction joins the current playhead without replaying the intro.
      if (error?.name === 'NotAllowedError') blocked = true;
      else if (error?.name !== 'AbortError') failed = true;
    });
  }
  const unlock = () => attempt();
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  return {
    async prepare(next: Splash2Audio, sound = true): Promise<Prepared> {
      const request = ++generation;
      cancelPrepare?.(); clearMedia(); settings = next;
      duration = 0; ready = failed = attempted = blocked = false;
      if (disposed || !sound || !next.enabled) { ready = true; return { duration: 0, failed: false }; }
      const current = new Audio(); media = current;
      current.preload = 'auto'; current.crossOrigin = 'anonymous';
      current.addEventListener('error', () => {
        if (disposed || media !== current) return;
        failed = true; pause();
      });
      current.addEventListener('ended', () => { if (media === current) driven = false; });
      const prepared = new Promise<Prepared>(resolve => {
        let done = false, positioned = false, warmedThrough = 0;
        const events = ['loadedmetadata', 'durationchange', 'loadeddata', 'progress', 'canplay', 'seeked', 'error'];
        const finish = (result: Prepared) => {
          if (done) return;
          done = true; clearInterval(poll);
          for (const event of events) current.removeEventListener(event, check);
          if (cancelPrepare === cancel) cancelPrepare = undefined;
          if (request === generation && !disposed) {
            ready = true; failed = result.failed;
            if (failed) clearMedia();
          }
          resolve(result);
        };
        const cancel = () => finish({ duration: 0, failed: false });
        const check = () => {
          if (failed || current.error) { finish({ duration: 0, failed: true }); return; }
          if (!Number.isFinite(current.duration) || current.duration <= 0) return;
          duration = current.duration * 1000;
          const from = next.offset / 1000;
          if (from >= current.duration) { finish({ duration, failed: false }); return; }
          if (!positioned) {
            positioned = true;
            if (Math.abs(current.currentTime - from) > .01) current.currentTime = from;
          }
          const end = Math.min(current.duration, from + openingBufferSeconds);
          if (current.readyState < 2 || current.seeking) return;
          for (let i = 0; i < current.buffered.length; i++) {
            if (current.buffered.start(i) > from + .01 || current.buffered.end(i) <= from) continue;
            const bufferedThrough = current.buffered.end(i);
            if (bufferedThrough >= end - .02) {
              // Preparation may have advanced the paused decoder to request
              // more data. Return to the configured start before playback.
              if (Math.abs(current.currentTime - from) > .01) { current.currentTime = from; return; }
              finish({ duration, failed: false }); return;
            }
            // Chrome can suspend preload after ~3 seconds on a throttled
            // connection, even with preload="auto". Request the next part by
            // moving the paused decoder to its buffered edge. No scene or
            // audio plays until the full lead is present and we have rewound.
            if (current.networkState === current.NETWORK_IDLE && bufferedThrough > warmedThrough + .01) {
              warmedThrough = bufferedThrough;
              current.currentTime = Math.max(from, bufferedThrough - .05);
            }
            return;
          }
        };
        // Slow downloads still need the full lead. Only an actual media error
        // may fall back to a silent intro; elapsed time is not audio readiness.
        const poll = setInterval(check, 100);
        cancelPrepare = cancel;
        for (const event of events) current.addEventListener(event, check);
      });
      current.src = assetUrl(next.url); current.load();
      return prepared;
    },
    /** A skip needs its own buffered lead, not just readiness at the beginning. */
    canSeek(at: number) {
      if (!ready) return false;
      if (failed || !media || at < settings.at) return true;
      const from = (settings.offset + at - settings.at) / 1000;
      if (from >= media.duration) return true;
      const end = Math.min(media.duration, from + openingBufferSeconds);
      for (let i = 0; i < media.buffered.length; i++) {
        if (media.buffered.start(i) <= from + .01 && media.buffered.end(i) >= end - .02) return true;
      }
      return false;
    },
    /** The native audio clock freezes during buffering, keeping visuals aligned. */
    playhead(): number | undefined {
      if (!driven || blocked || failed || !playing || !media || media.ended || !graph || getAudioContext().state !== 'running') return;
      const window = splash2AudioWindow(holdEnding ? { ...settings, end: 'clip' } : settings, duration, anchors);
      return Math.min(window.end, settings.at + Math.max(0, media.currentTime * 1000 - settings.offset));
    },
    sync(at: number, active: boolean, masterVolume = 1) {
      if (disposed) return;
      const wasPlaying = playing;
      time = at; playing = active; volume = masterVolume;
      if (!active) { if (wasPlaying) pause(); return; }
      if (!ready || failed || !media) return;
      const window = splash2AudioWindow(holdEnding ? { ...settings, end: 'clip' } : settings, duration, anchors);
      if (at < settings.at || at >= window.end) { if (driven || pending) pause(); return; }
      const target = (settings.offset + at - settings.at) / 1000;
      if (driven && !media.seeking && Math.abs(media.currentTime - target) > .18) media.currentTime = target;
      if (!wasPlaying || !attempted) attempt();
      envelope();
    },
    holdEnding(held: boolean) { holdEnding = held; },
    anchors(next: Splash2AudioAnchors) { anchors = next; },
    finish(fadeOut: number) {
      const remaining = splash2AudioWindow(holdEnding ? { ...settings, end: 'clip' } : settings, duration, anchors).end - time;
      holdEnding = false;
      settings = { ...settings, end: 'time', endAt: time, fadeOut: Math.max(0, Math.min(fadeOut, remaining)) };
    },
    unlock, setMuted,
    dispose() {
      if (disposed) return;
      disposed = true; generation++; cancelPrepare?.(); clearMedia();
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
      releaseAudio();
    }
  };
}
