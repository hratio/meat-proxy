import * as THREE from 'three';
import type { WeaponProfile } from './profiles';

/** Animate roll around local Z, leaving the barrel's -Z aim unchanged. */
export function createSprayPose() {
  let progress = 0, phase = 0;
  const value = { roll: 0, recoil: 1 };
  return {
    reset() { progress = 0; phase = 0; value.roll = 0; value.recoil = 1; },
    // heldMs is measured from the current trigger press; -1 means released.
    update(deltaMs: number, heldMs: number, profile: WeaponProfile, reducedMotion: boolean) {
      if (reducedMotion) progress = 0;
      else {
        const delta = Math.max(0, deltaMs);
        const rolling = profile.sprayRoll && heldMs >= profile.sprayDelayMs;
        // A frame crossing the threshold only contributes time after the delay.
        // Release starts returning immediately, including during a new press's delay.
        const step = rolling ? Math.min(delta, heldMs - profile.sprayDelayMs) : -delta;
        progress = THREE.MathUtils.clamp(progress + step / profile.sprayTransitionMs, 0, 1);
        if (rolling && profile.sprayMode === 'oscillate') {
          phase = (phase + step * Math.PI * 2 / profile.sprayPeriodMs) % (Math.PI * 2);
        }
      }
      if (progress === 0) phase = 0;
      const eased = progress * progress * (3 - 2 * progress);
      let angle = THREE.MathUtils.degToRad(profile.sprayAngleDeg ?? 90);
      if (profile.sprayMode === 'oscillate') {
        const middle = (profile.sprayMinAngleDeg + profile.sprayMaxAngleDeg) / 2;
        const amplitude = (profile.sprayMaxAngleDeg - profile.sprayMinAngleDeg) / 2;
        angle = THREE.MathUtils.degToRad(middle + amplitude * Math.sin(phase));
      }
      // Freeze the phase on release and fade that angle to rest. Retaining the
      // phase during a partial return also avoids a snap on a quick re-press.
      value.roll = eased ? eased * angle : 0;
      value.recoil = THREE.MathUtils.lerp(1, profile.sprayRecoilMultiplier, eased);
      return value;
    }
  };
}
