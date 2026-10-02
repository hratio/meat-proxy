import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { closeAudioContext } from '../../audio';
import { defaultSplash2Audio } from './splash2-audio-config';
import { createSplash2Stream } from './splash2-stream';

let permitted: boolean, contextPermitted: boolean, buffered: boolean;
let media: TestAudio, context: TestContext;
let player: ReturnType<typeof createSplash2Stream>;
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

class TestAudio extends EventTarget {
  src = ''; preload = ''; crossOrigin = ''; duration = 60; currentTime = 0;
  paused = true; ended = false; seeking = false; error = null;
  NETWORK_IDLE = 1; networkState = 2;
  get readyState() { return buffered ? 4 : 1; }
  get buffered() { return { length: buffered ? 1 : 0, start: () => 0, end: () => 60 }; }
  constructor() { super(); media = this; }
  play = vi.fn(() => {
    if (!permitted) return Promise.reject(new DOMException('Interaction required', 'NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => { this.paused = true; });
  load() { if (this.src) queueMicrotask(() => this.dispatchEvent(new Event('canplay'))); }
  removeAttribute() { this.src = ''; }
}
class TestContext {
  state = 'suspended'; currentTime = 0; destination = {};
  resumptions: (() => void)[] = [];
  gains: { gain: { value: number } }[] = [];
  constructor() { context = this; }
  resume = vi.fn(() => {
    if (!contextPermitted) return new Promise<void>(resolve => this.resumptions.push(resolve));
    this.state = 'running';
    for (const resolve of this.resumptions.splice(0)) resolve();
    return Promise.resolve();
  });
  close = async () => {};
  createMediaElementSource() { return { connect() {}, disconnect() {} }; }
  createGain() {
    const node = { connect() {}, disconnect() {}, gain: { value: 1,
      setValueAtTime(value: number) { this.value = value; },
      linearRampToValueAtTime(value: number) { this.value = value; },
      cancelAndHoldAtTime() {} } };
    this.gains.push(node); return node;
  }
}

beforeEach(() => {
  permitted = contextPermitted = buffered = true;
  vi.stubGlobal('Audio', TestAudio);
  vi.stubGlobal('AudioContext', TestContext);
  player = createSplash2Stream();
});
afterEach(() => { player.dispose(); closeAudioContext(); vi.unstubAllGlobals(); });

it('automatically advances when both media and Web Audio allow playback', async () => {
  await player.prepare(defaultSplash2Audio);
  player.sync(0, true, .18);
  expect(player.canAdvance()).toBe(false);
  await settle();
  expect(player.canAdvance()).toBe(true);
  expect(player.needsGesture()).toBe(false);
  media.currentTime = 1.25;
  expect(player.playhead()).toBe(1250);
});

it('holds at the beginning on denial, then retries both APIs inside the gesture', async () => {
  permitted = contextPermitted = false;
  await player.prepare(defaultSplash2Audio);
  player.sync(0, true);
  await settle();
  expect(player.canAdvance()).toBe(false);
  expect(player.needsGesture()).toBe(true);
  expect(player.playhead()).toBeUndefined();
  player.sync(0, true);
  expect(media.play).toHaveBeenCalledTimes(1);
  permitted = contextPermitted = true;
  player.unlock();
  expect(context.resume).toHaveBeenCalledTimes(2);
  expect(media.play).toHaveBeenCalledTimes(2);
  expect(media.currentTime).toBe(0);
  await settle();
  expect(player.canAdvance()).toBe(true);
  expect(player.needsGesture()).toBe(false);
});

it('detects a suspended context even when resume never settles and media play succeeds', async () => {
  contextPermitted = false;
  await player.prepare(defaultSplash2Audio);
  player.sync(0, true);
  await settle();
  expect(player.needsGesture()).toBe(true);
  expect(player.canAdvance()).toBe(false);
  expect(media.paused).toBe(true);
  media.currentTime = 3;
  contextPermitted = true;
  player.unlock();
  await settle();
  expect(media.currentTime).toBe(0);
  expect(player.canAdvance()).toBe(true);
});

it('uses an early gesture while buffering without playing the intro early', async () => {
  buffered = false;
  const preparation = player.prepare({ ...defaultSplash2Audio, offset: 1500 });
  player.unlock();
  expect(media.play).toHaveBeenCalledOnce();
  expect(context.gains[0].gain.value).toBe(0);
  await settle();
  expect(media.paused).toBe(true);
  expect(media.currentTime).toBe(1.5);
  expect(player.canAdvance()).toBe(false);
  buffered = true; media.dispatchEvent(new Event('canplay'));
  await preparation;
  player.sync(0, true);
  await settle();
  expect(player.canAdvance()).toBe(true);
  expect(media.currentTime).toBe(1.5);
});

it('checks permission before starting an intro whose audio cue comes later', async () => {
  permitted = false;
  await player.prepare({ ...defaultSplash2Audio, at: 2000 });
  player.sync(0, true);
  await settle();
  expect(player.canAdvance()).toBe(false);
  expect(player.needsGesture()).toBe(true);
  permitted = true; player.unlock();
  await settle();
  expect(media.paused).toBe(true);
  expect(player.canAdvance()).toBe(true);
  player.sync(2000, true);
  await settle();
  expect(media.paused).toBe(false);
  expect(player.canAdvance()).toBe(true);
});

it('keeps an early probe silent when readiness changes, without duplicate play requests', async () => {
  await player.prepare(defaultSplash2Audio);
  player.unlock();
  player.unlock();
  player.sync(0, true, .18);
  expect(media.play).toHaveBeenCalledOnce();
  expect(context.gains[0].gain.value).toBe(0);
  await settle();
  expect(media.paused).toBe(true);
  player.sync(0, true, .18);
  await settle();
  expect(media.play).toHaveBeenCalledTimes(2);
  expect(context.gains[0].gain.value).toBeGreaterThan(0);
  expect(player.canAdvance()).toBe(true);
});

it('continues silently for disabled sound, an intentional mute, or a real media error', async () => {
  await player.prepare(defaultSplash2Audio, false);
  player.sync(0, true);
  expect(player.canAdvance()).toBe(true);
  expect(player.needsGesture()).toBe(false);

  permitted = false;
  await player.prepare(defaultSplash2Audio);
  player.setMuted(true); player.sync(0, true);
  await settle();
  expect(player.canAdvance()).toBe(true);
  expect(player.needsGesture()).toBe(false);

  player.setMuted(false);
  media.dispatchEvent(new Event('error'));
  expect(player.canAdvance()).toBe(true);
  expect(player.needsGesture()).toBe(false);
});

it('ignores a pending autoplay result after disposal', async () => {
  contextPermitted = false;
  await player.prepare(defaultSplash2Audio);
  player.sync(0, true);
  await settle();
  player.dispose();
  contextPermitted = true; await context.resume();
  await settle();
  expect(media.play).toHaveBeenCalledOnce();
  expect(media.paused).toBe(true);
});
