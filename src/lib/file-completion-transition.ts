import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

export function leaveCompletedFile(node: HTMLElement, { reducedMotion = false } = {}): TransitionConfig {
  if (reducedMotion) return { duration: 0 };
  const height = node.offsetHeight;
  return {
    duration: 220,
    easing: cubicOut,
    // Clip vertically as the gap closes, but retain the tablet and badges in the gutters.
    css: (t, u) => `height: ${height * t}px; min-height: 0; opacity: ${t}; clip-path: inset(0 -100vw 0 -100vw);`
  };
}
