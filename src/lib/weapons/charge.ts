import type { WeaponProfile } from './profiles';

export function weaponCharge(heldMs: number, profile: WeaponProfile) {
  return profile.effect === 'plasma' && heldMs >= 0 ? Math.min(1, heldMs / profile.chargeMs) : 0;
}

/** Capture input timestamps so even a press/release between frames fires once. */
export function createWeaponCharge(profile: WeaponProfile, since: number) {
  let active = true;
  return {
    since,
    level(time: number) { return active ? weaponCharge(Math.max(0, time - since), profile) : 0; },
    release(time: number) {
      if (!active) return undefined;
      const level = this.level(time);
      active = false;
      return level;
    },
    cancel() { active = false; }
  };
}
export type WeaponCharge = ReturnType<typeof createWeaponCharge>;
