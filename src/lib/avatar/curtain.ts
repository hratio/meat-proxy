import { transitionDefaults, type AvatarTransitionFrame, type AvatarTransitions } from './transitions';

export type CurtainPhase = 'open' | 'closing' | 'closed' | 'opening';
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

/** Presentation override; expression requests and their completion clock stay independent. */
export function createPortraitCurtain() {
  let phase: CurtainPhase = 'open', owner: number | undefined;
  let settings = { ...transitionDefaults }, elapsed = 0, closeFrom = 0, reduced = false;
  const duration = () => Math.max(0, phase === 'closing' ? settings.outroMs : settings.introMs);
  const progress = () => duration() ? clamp(elapsed / duration()) : 1;
  const coverage = () => {
    const p = progress();
    if (phase === 'closed') return 1;
    if (phase === 'closing') return closeFrom + (1 - closeFrom) * smooth(p);
    if (phase === 'open') return 0;
    if (settings.intro === 'shutter-open') return (1 - p) ** 3;
    if (settings.intro === 'slide-left') return (1 - clamp(p / .5)) ** 3;
    return 1 - clamp((p - .17) / .83);
  };
  function update(deltaMs: number) {
    if (reduced) { phase = owner === undefined ? 'open' : 'closed'; elapsed = 0; return; }
    let remaining = Math.max(0, deltaMs);
    while (phase === 'closing' || phase === 'opening') {
      const step = Math.min(remaining, Math.max(0, duration() - elapsed));
      elapsed += step; remaining -= step;
      if (elapsed < duration()) break;
      phase = phase === 'opening' ? 'open' : owner === undefined ? 'opening' : 'closed';
      elapsed = 0;
    }
  }
  return {
    get phase() { return phase; },
    get moving() { return phase === 'closing' || phase === 'opening'; },
    get closedFor() { return phase === 'closed' ? owner : undefined; },
    get frame(): AvatarTransitionFrame | undefined {
      if (phase === 'open') return;
      return {
        ...settings, outro: 'shutter-close', phase: phase === 'opening' ? 'intro' : 'outro',
        progress: phase === 'closed' ? 1 : progress(),
        shutterCoverage: phase === 'opening' ? undefined : coverage()
      };
    },
    setCover(id: number | undefined, transitions: AvatarTransitions, reducedMotion: boolean) {
      if (id !== undefined && (phase === 'open' || phase === 'opening')) {
        closeFrom = coverage(); elapsed = 0; phase = 'closing'; settings = { ...transitions };
      } else if (id === undefined && owner !== undefined) {
        // A cancelled entrance still closes fully before using the chosen reveal effect.
        settings = { ...settings, intro: transitions.intro, introMs: transitions.introMs };
        if (phase === 'closed') { elapsed = 0; phase = 'opening'; }
      }
      owner = id; reduced = reducedMotion;
      update(0);
    },
    update
  };
}
