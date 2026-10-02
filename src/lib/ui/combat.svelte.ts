import { getContext, setContext, untrack } from 'svelte';

const key = Symbol('combat-control');
export class CombatControl {
  keyboardNavigation = false;
  private holds = $state<symbol[]>([]);
  paused = $derived(this.holds.length > 0);
  private weaponTrackingHolds = $state<symbol[]>([]);
  weaponTrackingPaused = $derived(this.weaponTrackingHolds.length > 0);

  // Independent popups can pause gameplay without accidentally resuming one
  // another. Keep the release function and call it on close/unmount.
  pause() {
    const token = Symbol();
    this.holds = [...this.holds, token];
    return () => { this.holds = this.holds.filter(hold => hold !== token); };
  }

  // Tracking is independent of shooting: floating panels can leave gameplay
  // available while keeping the weapon from following their controls.
  pauseWeaponTracking() {
    const token = Symbol();
    this.weaponTrackingHolds = [...this.weaponTrackingHolds, token];
    return () => { this.weaponTrackingHolds = this.weaponTrackingHolds.filter(hold => hold !== token); };
  }
}
export function provideCombat() { return setContext(key, new CombatControl()); }
export function useCombat() { return getContext<CombatControl>(key); }

export function pauseCombatWhile(when: () => boolean) {
  const combat = useCombat();
  $effect(() => { if (when()) return untrack(() => combat.pause()); });
}

export function pauseWeaponTrackingWhile(when: () => boolean) {
  const combat = useCombat();
  $effect(() => { if (when()) return untrack(() => combat.pauseWeaponTracking()); });
}
