import { cubicOut, quintOut } from 'svelte/easing';
import { splashExit } from './transition';
import { splash2LayerNames, splash2Durations, splash2DriftPart, splash2DriftStartsAt, splash2LayerImpactAt, type Splash2Config, type Splash2LayerName } from './splash2-playback-config';

const progress = (time: number, at: number, duration: number) => time < at ? 0 : duration <= 0 ? 1 : Math.max(0, Math.min(1, (time - at) / duration));
const contact = .48;
function stamp(p: number, punch: number) {
  if (p < contact) return punch + (.955 - punch) * quintOut(p / contact);
  if (p < .7) return .955 + .063 * cubicOut((p - contact) / (.7 - contact));
  return 1.018 - .018 * cubicOut((p - .7) / .3);
}

/** Stateless sampling keeps reverse scrubbing, replay, and live cue edits deterministic. */
export function sampleSplash2(time: number, config: Splash2Config, loop = false, reduced = false) {
  const layers = {} as Record<Splash2LayerName, { opacity: number; transform: string }>;
  const driftSeconds = reduced ? 0 : Math.max(0, time - splash2DriftStartsAt(config)) / 1000;
  let shake = 0;
  if (!reduced) for (const name of splash2LayerNames) {
    const duration = config.timing[`${name}Duration`];
    if (!duration || config.motion[name].entrance === 'fade') continue;
    const hit = splash2LayerImpactAt(config, name);
    const elapsed = time - hit;
    if (elapsed >= 0 && elapsed < 460) shake += Math.sin(elapsed / 23) * Math.exp(-elapsed / 100) * config.impact;
  }
  for (const name of splash2LayerNames) {
    const layout = config.layers[name], motion = config.motion[name];
    const p = reduced ? 1 : progress(time - config.openingDelay, config.timing[`${name}At`], config.timing[`${name}Duration`]);
    const travel = reduced ? 0 : (1 - quintOut(p)) * motion.distance;
    // A shared rate and clock keep the rings/pylons and split title rigid,
    // including when a custom start occurs while their entrances are playing.
    const drift = config.drift.parts[splash2DriftPart(name)];
    const x = layout.x + shake + driftSeconds * drift.x + (motion.entrance === 'left' ? -travel : motion.entrance === 'right' ? travel : 0);
    const y = layout.y - shake * .55 + driftSeconds * drift.y + (motion.entrance === 'top' ? -travel : motion.entrance === 'bottom' ? travel : 0);
    const zoom = !reduced && motion.entrance === 'stamp' ? stamp(p, motion.punch) : 1;
    layers[name] = {
      opacity: reduced ? 1 : motion.entrance === 'fade' ? cubicOut(p) : progress(p, 0, .12),
      transform: `translate(${x}%, ${y}%) rotate(${layout.rotation}deg) scale(${layout.scale * zoom})`
    };
  }
  const exit = splashExit(loop ? progress(time, splash2Durations(config).complete, config.introduction.exitMs) : 0, config.introduction.exitDistance, reduced);
  return { layers, opacity: exit.opacity, y: exit.y };
}
