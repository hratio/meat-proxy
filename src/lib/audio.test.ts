import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { closeAudioContext, createWeaponAudio } from './audio';
import { weaponProfiles } from './weapons/profiles';

const sources: { stop: ReturnType<typeof vi.fn> }[] = [];
let weapon: ReturnType<typeof createWeaponAudio>;
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

beforeEach(() => {
  sources.length = 0;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  vi.stubGlobal('AudioContext', class {
    currentTime = 0; state = 'running'; destination = {};
    resume = async () => {}; close = async () => {};
    decodeAudioData = async () => ({ duration: 3 });
    createGain() {
      return { connect() {}, disconnect() {}, gain: { value: 1,
        setValueAtTime() {}, linearRampToValueAtTime() {}, cancelAndHoldAtTime() {}, cancelScheduledValues() {} } };
    }
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start: vi.fn(), stop: vi.fn() };
      sources.push(source); return source;
    }
  });
  weapon = createWeaponAudio(() => {});
});
afterEach(() => { weapon.dispose(); closeAudioContext(); vi.unstubAllGlobals(); });

it('preserves a slow weapon report across clicks rejected by the firing cooldown', async () => {
  const profile = weaponProfiles['auto-bmg'];
  await weapon.preload([profile]);
  weapon.begin(0, profile, .2); weapon.shot(0); await settle(); weapon.end(0);
  const report = sources[0];
  expect(report).toBeDefined();
  // The gameplay cooldown rejects this click, so it never calls shot().
  weapon.begin(0, profile, .2); weapon.end(0); await settle();
  expect(sources).toHaveLength(1);
  expect(report.stop).not.toHaveBeenCalled();
  // A later accepted shot can overlap, subject to the configured voice limit.
  weapon.begin(0, profile, .2); weapon.shot(0); await settle();
  expect(sources).toHaveLength(2);
  expect(report.stop).not.toHaveBeenCalled();
});

it('still stops active audio on weapon changes and explicit cancellation', async () => {
  const rifle = weaponProfiles['auto-bmg'], pistol = weaponProfiles['rhein-9'];
  await weapon.preload([rifle, pistol]);
  weapon.begin(0, rifle, .2); weapon.shot(0); await settle(); weapon.end(0);
  weapon.begin(0, pistol, .2);
  expect(sources[0].stop).toHaveBeenCalledOnce();
  weapon.shot(0); await settle(); weapon.end(0, false);
  expect(sources.at(-1)!.stop).toHaveBeenCalledOnce();
});
