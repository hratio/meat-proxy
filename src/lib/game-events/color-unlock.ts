import type { WeaponProfile } from '../weapons/profiles';
import { shatterDurationMs } from './debris.ts';

// Scripted A-10 pass. Voices and faces remain ordinary Studio ad-lib rules.
export const colorUnlock = {
  // Flight timing. Shooting does not change the flight path.
  durationMs: 3000,          // Total flight time, from entry to exit.
  pullUpPercent: 50,        // Start climbing at this percentage of the flight (0–100).
  direction: 'left-to-right', // 'left-to-right' or 'right-to-left'.

  // Shooting timing. All start times count from the start of the flight.
  burstStartMs: 450,       // Start shooting this many milliseconds into the flight.
  burstDurationMs: 1150,     // Shoot for this long; the card breaks exactly when shooting ends.
  echoDelayMs: 50,         // Wait this long AFTER shooting ends before playing the echo.

  // Appearance and path shape; these do not change the timings above.
  bankStartDeg: -110,
  bankPeakDeg: -20,
  bankEndDeg: 130,
  diveDepthPx: 420,
  climbDepthPx: 380,
  planeWidthPx: 210         // Visual size of the plane in pixels; smaller panels scale it down.
};

// Everything below is derived or internal; tune the values above.
export const airstrikeModel = '/models/weapons/brrrt-10.glb';
export function getAirstrikeTiming(settings = colorUnlock) {
  const durationMs = Math.max(1, settings.durationMs);
  // Keep the burst inside the flight, including while experimenting with shorter durations.
  const burstStartMs = Math.min(durationMs, Math.max(0, settings.burstStartMs));
  const burstEndMs = Math.min(durationMs, burstStartMs + Math.max(0, settings.burstDurationMs));
  return {
    durationMs,
    pullUpMs: durationMs * Math.min(100, Math.max(0, settings.pullUpPercent)) / 100,
    burstStartMs, burstEndMs,
    echoStartMs: burstEndMs + Math.max(0, settings.echoDelayMs),
    // Let a late explosion finish even if the plane has already left.
    completeMs: Math.max(durationMs, burstEndMs + shatterDurationMs)
  };
}

export function airstrikeProfile(profile: WeaponProfile): WeaponProfile {
  return { ...profile, sound: { ...profile.sound, loopDelayMs: 0, releaseMs: 40, stopDelayMs: Math.max(0, colorUnlock.echoDelayMs), stopAfter: 'shot' } };
}

export type AirstrikeRect = { left: number; top: number; width: number; height: number };
export function airstrikePose(elapsed: number, width: number, target: AirstrikeRect, reduced: boolean, settings = colorUnlock) {
  const timing = getAirstrikeTiming(settings);
  const size = Math.min(settings.planeWidthPx, width * .32);
  const progress = Math.min(1, Math.max(0, elapsed / timing.durationMs));
  const facing = settings.direction === 'left-to-right' ? 1 : -1;
  const across = -size + progress * (width + size * 2);
  const x = reduced ? target.left + target.width * (facing === 1 ? .15 : .85) : facing === 1 ? across : width - across;
  // Meet two parabolic arcs at the chosen pull-up point, independent of the burst.
  const turn = timing.pullUpMs / timing.durationMs;
  const apex = target.top + target.height * .55;
  const diving = progress < turn;
  const segment = diving ? turn : 1 - turn;
  const arc = segment > 0 ? Math.abs(progress - turn) / segment : 0;
  const depth = diving ? settings.diveDepthPx : settings.climbDepthPx;
  const y = reduced ? target.top - size * .25 : apex - depth * arc * arc;
  const slope = segment > 0 ? (diving ? 2 : -2) * depth * arc / segment : 0;
  const angleDeg = -facing * (reduced ? 20 : Math.atan2(slope, width + size * 2) * 180 / Math.PI);
  const roll = progress < .5 ? progress * 2 : (progress - .5) * 2;
  const eased = roll * roll * (3 - 2 * roll);
  const bankDeg = reduced ? settings.bankStartDeg : progress < .5
    ? settings.bankStartDeg + (settings.bankPeakDeg - settings.bankStartDeg) * eased
    : settings.bankPeakDeg + (settings.bankEndDeg - settings.bankPeakDeg) * eased;
  return { x, y, size, facing, angleDeg, bankDeg, visible: elapsed >= 0 && elapsed < timing.durationMs,
    firing: elapsed >= timing.burstStartMs && elapsed < timing.burstEndMs };
}

export type AirstrikeBeat = 'burst' | 'impact' | 'release' | 'complete';
/** One foreground clock owns visuals, sound and the single impact. */
export function createAirstrikeSequence(onbeat: (beat: AirstrikeBeat) => void, settings = colorUnlock) {
  const timing = getAirstrikeTiming(settings);
  let elapsed = -1, running = false;
  const reached = new Set<AirstrikeBeat>();
  const beats: [AirstrikeBeat, number][] = [
    ['burst', timing.burstStartMs], ['release', timing.burstEndMs],
    ['impact', timing.burstEndMs], ['complete', timing.completeMs]
  ];
  return {
    get elapsed() { return elapsed; },
    get running() { return running; },
    start() { if (running) return; elapsed = 0; reached.clear(); running = true; },
    cancel() { running = false; elapsed = -1; },
    advance(deltaMs: number) {
      if (!running) return;
      elapsed += Math.max(0, deltaMs);
      for (const [beat, at] of beats) {
        if (!running || elapsed < at || reached.has(beat)) continue;
        reached.add(beat);
        if (beat === 'complete') running = false;
        onbeat(beat);
      }
    }
  };
}
