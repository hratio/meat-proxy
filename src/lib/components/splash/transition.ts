import type { TransitionConfig } from 'svelte/transition';
import { introductionDefaults, type IntroductionConfig } from '../../introduction/config';

export function splashExit(progress: number, distance: number, reduced = false) {
  const p = Math.max(0, Math.min(1, progress));
  return { opacity: reduced ? 1 - p : 1 - Math.max(0, (p - .65) / .35), y: reduced ? 0 : -distance * p * p * p };
}

/** The prepared arena enters underneath the departing title/reviewer assembly. */
export function leaveSplash(_node: Element, { reducedMotion = false, introduction = introductionDefaults }: { reducedMotion?: boolean; introduction?: IntroductionConfig } = {}): TransitionConfig {
  return {
    duration: reducedMotion ? 100 : introduction.exitMs,
    css: (_t, u) => {
      const exit = splashExit(u, introduction.exitDistance, reducedMotion);
      return `opacity: ${exit.opacity}; transform: translate3d(0, ${exit.y}%, 0); pointer-events: none;`;
    }
  };
}
