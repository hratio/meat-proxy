import type { IntroductionConfig } from './config';

export type IntroductionPhase = 'preparing' | 'entering' | 'firing' | 'completing' | 'restoring' | 'done';
type Actions = {
  change(phase: IntroductionPhase): void;
  ready(): boolean;
  aim(progress: number): boolean;
  fire(): void;
  stop(): void;
  defeated(): boolean;
  completionFinished(): boolean;
  restore(): void;
  restored(): boolean;
  fadeMusic(): void;
  release(): void;
};

/** Owns only the introduction lifecycle; the arena supplies its normal actions. */
export function createIntroduction(config: IntroductionConfig, actions: Actions) {
  let phase: IntroductionPhase = 'preparing', since = 0;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let pausedAt: number | undefined, deadline = 0, timeout: (() => void) | undefined;
  function watch(callback: () => void, ms: number) {
    clearTimeout(watchdog);
    timeout = callback; deadline = performance.now() + ms;
    if (pausedAt === undefined) watchdog = setTimeout(callback, ms);
  }
  function setPaused(paused: boolean) {
    const now = performance.now();
    if (paused && pausedAt === undefined) {
      pausedAt = now; clearTimeout(watchdog);
    } else if (!paused && pausedAt !== undefined) {
      const elapsed = now - pausedAt;
      since += elapsed; deadline += elapsed; pausedAt = undefined;
      if (timeout && phase !== 'done') watchdog = setTimeout(timeout, Math.max(0, deadline - now));
    }
  }
  function move(next: IntroductionPhase, now = performance.now()) {
    if (pausedAt !== undefined) pausedAt = now;
    phase = next; since = now; actions.change(next);
  }
  function finish() {
    if (phase === 'done') return;
    clearTimeout(watchdog);
    actions.stop();
    if (phase !== 'restoring') actions.restore();
    actions.release(); move('done');
  }
  function restore(now = performance.now()) {
    actions.stop(); actions.fadeMusic(); actions.restore(); move('restoring', now);
    // Both completion and cancellation have a bound if the regular loadout
    // fails to become ready. Hidden time does not consume this deadline.
    watch(finish, 5000);
  }
  function cancel() {
    if (phase !== 'done' && phase !== 'restoring') restore();
  }
  return {
    start() {
      if (phase !== 'preparing') return;
      watch(cancel, config.entranceMs + config.firingMs + 15_000);
      move('entering');
    },
    update(now: number) {
      if (pausedAt !== undefined) return;
      if (phase === 'entering') {
        if (!actions.ready() || now - since < config.entranceMs || !actions.aim(0)) return;
        move('firing', now); actions.fire();
      } else if (phase === 'firing') {
        actions.aim(Math.min(1, (now - since) / config.firingMs));
        // Duration controls the aim and damage budget, never completion. The
        // arena's normal lethal shot starts the completion/save animation.
        if (!actions.defeated()) return;
        actions.stop(); move('completing', now);
      } else if (phase === 'completing' && actions.completionFinished()) {
        restore(now);
      } else if (phase === 'restoring' && actions.restored() && now - since >= config.musicFadeMs) finish();
    },
    cancel,
    setPaused,
    dispose() { if (phase !== 'done') actions.fadeMusic(); finish(); }
  };
}
