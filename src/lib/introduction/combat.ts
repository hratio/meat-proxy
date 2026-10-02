import type { DestructionCombat } from '$lib/destruction/model';
import { destructionSchema } from '$lib/destruction/config';

/** Both guns fire immediately, then at their normal weapon cadence. Duration
 * selects a hit budget; only real hits can spend the target's health. */
export function introductionCombat(health: number, durationMs: number, intervals: number[]): DestructionCombat {
  const hits = intervals.reduce((count, interval) => count + 1 + Math.floor(durationMs / interval), 0);
  // Unlimited destruction still needs a finite target in the guided demo.
  const maximum = health > 0 ? health : destructionSchema.parse({}).shotsToComplete;
  return { health: maximum, damagePerHit: maximum / Math.max(1, hits), hitbox: 'panel' };
}
