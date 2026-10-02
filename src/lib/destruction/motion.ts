import type { DestructionSettings } from './config';

export type DebrisMotionSettings = Pick<DestructionSettings, 'particleSpeed' | 'particleSpeedVariation' | 'particleSpreadDeg' | 'particleLift' | 'particleGravity' | 'particleSpin'>;
type Point = { x: number; y: number };

/** Randomness is sampled once at launch. Motion stays ballistic and needs no
 * per-frame randomness, physics solver or additional DOM measurements. */
export function characterLaunch(fragment: Point, impact: Point, settings: DebrisMotionSettings, random = Math.random) {
  const dx = fragment.x - impact.x, dy = fragment.y - impact.y;
  const outward = Math.hypot(dx, dy) < .5 ? random() * Math.PI * 2 : Math.atan2(dy, dx);
  const angle = outward + (random() * 2 - 1) * settings.particleSpreadDeg * Math.PI / 180;
  // Many slower fragments and a few fast outliers, instead of one uniform spray.
  const varied = .05 + 2.95 * random() ** 2;
  const speed = settings.particleSpeed * (1 + settings.particleSpeedVariation * (varied - 1));
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - settings.particleLift,
    spin: (random() * 2 - 1) * settings.particleSpin * Math.PI * 2,
    gravity: settings.particleGravity
  };
}
