import { hudSchema } from './hud-config';

type Cue = { drawn: boolean; selection: string; delayMs: number; peekMs: number };

// One controller per weapon. Reversals cancel pending transitions, and switching
// rules refreshes only this weapon's example. The peek clock starts with the HUD.
export function createHudCue(draw: (drawn: boolean) => void, peek: (visible: boolean) => void, navigate: (visible: boolean) => void = () => {}) {
  let current: Cue | undefined;
  let transition: ReturnType<typeof setTimeout> | undefined;
  let dismissal: ReturnType<typeof setTimeout> | undefined;
  let navigationDismissal: ReturnType<typeof setTimeout> | undefined;
  let held = false, peeking = false, navigating = false;
  const showPeek = (visible: boolean) => { peeking = visible; peek(visible); };
  const showNavigation = (visible: boolean) => { navigating = visible; navigate(visible); };
  function scheduleDismissal() {
    clearTimeout(dismissal); clearTimeout(navigationDismissal);
    if (held) return;
    if (peeking) dismissal = setTimeout(() => showPeek(false), current?.peekMs || 0);
    if (navigating) navigationDismissal = setTimeout(() => showNavigation(false), current?.peekMs || hudSchema.shape.codePeekMs.parse(undefined));
  }
  function reveal() {
    showPeek((current?.peekMs || 0) > 0);
    scheduleDismissal();
  }
  return {
    update(next: Cue) {
      const previous = current;
      current = next;
      if (!next.drawn) {
        clearTimeout(navigationDismissal);
        showNavigation(false);
      } else if (previous && previous.selection !== next.selection) {
        clearTimeout(navigationDismissal);
        showNavigation(true);
        // Navigators only appear when cycling. Disabling temporary examples
        // must not leave these panels open or disable their dismissal timer.
        scheduleDismissal();
      }
      if (previous?.drawn !== next.drawn) {
        clearTimeout(transition);
        clearTimeout(dismissal);
        transition = undefined;
        const apply = () => {
          transition = undefined;
          draw(next.drawn);
          if (next.drawn) reveal(); else showPeek(false);
        };
        if (previous && next.delayMs > 0) transition = setTimeout(apply, next.delayMs);
        else apply();
      } else if (next.drawn && !transition && (previous.selection !== next.selection || previous.peekMs !== next.peekMs)) {
        reveal();
      }
    },
    hold(value: boolean) {
      if (held === value) return;
      held = value;
      // Leaving the HUD grants a fresh reading interval. Hovering never opens
      // a closed panel or overrides the user's permanent visibility settings.
      scheduleDismissal();
    },
    dispose() {
      clearTimeout(transition); clearTimeout(dismissal); clearTimeout(navigationDismissal);
      current = undefined; held = peeking = navigating = false;
    }
  };
}
