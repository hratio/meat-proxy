export type StartupPhase = 'waiting' | 'bar' | 'portrait' | 'shutter' | 'weapons' | 'ready';

export const startupTiming = { bar: 420, portrait: 420, shutter: 720 } as const;

const nextPhase = { bar: 'portrait', portrait: 'shutter', shutter: 'weapons', weapons: 'ready' } as const;

/** A page-lifetime entrance, independent of the gameplay event queue. */
export function createStartupSequence(change: (phase: StartupPhase) => void) {
  let phase: StartupPhase = 'waiting';
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  function move(next: StartupPhase) {
    if (disposed || phase === 'ready' || phase === next) return;
    phase = next;
    if (phase === 'ready') clearTimeout(watchdog);
    change(phase);
  }
  return {
    start(together = false) {
      if (disposed || phase !== 'waiting') return;
      // Interrupted animations or a stalled model request must not hold the entrance open.
      watchdog = setTimeout(() => move('ready'), 15_000);
      move(together ? 'weapons' : 'bar');
    },
    complete(completed: keyof typeof nextPhase) {
      if (phase === completed) move(nextPhase[completed]);
    },
    skip() { move('ready'); },
    dispose() { disposed = true; clearTimeout(watchdog); }
  };
}
