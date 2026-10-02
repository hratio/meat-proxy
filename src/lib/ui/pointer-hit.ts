export type PointerHit = { surface: Element | null; inner: Element | null; path: Element[] };

/** One DOM hit per invalidation, shared by cursor classification and review targeting. */
export function createPointerHitTest(position: () => { x: number; y: number }) {
  let dirty = true, x = NaN, y = NaN;
  let value: PointerHit = { surface: null, inner: null, path: [] };
  const moving = new Map<Element, Set<string>>();
  let roots: (ShadowRoot | null)[] = [];
  const invalidate = () => { dirty = true; };
  const geometry = /^(transform|translate|scale|rotate|top|left|right|bottom|width|height|margin|padding|inset)/;
  const motion = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const animation = event as AnimationEvent & TransitionEvent;
    if (animation.pseudoElement) return;
    const key = animation.animationName || animation.propertyName;
    if (event.type.endsWith('end') || event.type.endsWith('cancel')) {
      moving.get(target)?.delete(key); if (!moving.get(target)?.size) moving.delete(target); invalidate(); return;
    }
    const changesBounds = animation.propertyName ? geometry.test(animation.propertyName)
      : target.getAnimations().some(item => item.effect instanceof KeyframeEffect && item.effect.getKeyframes().some(frame => Object.keys(frame).some(property => geometry.test(property))));
    if (!changesBounds) return;
    if (getComputedStyle(target).pointerEvents === 'none' && !target.querySelector('button, a, input, [role="button"], [data-shoot-transmission]')) return;
    const keys = moving.get(target) || new Set<string>(); keys.add(key); moving.set(target, keys); invalidate();
  };
  const options: MutationObserverInit = {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'disabled', 'aria-hidden', 'data-reviewed', 'data-file-path', 'data-line', 'data-column-number', 'data-cursor', 'role', 'contenteditable', 'data-shoot-transmission', 'data-file-badge-panel']
  };
  const mutations = new MutationObserver(invalidate), shadow = new MutationObserver(invalidate);
  mutations.observe(document.documentElement, options);
  const resize = new ResizeObserver(invalidate); resize.observe(document.documentElement); resize.observe(document.body);
  const events = ['scroll', 'resize', 'load', 'pointerdown', 'pointerup', 'keydown', 'visibilitychange'];
  const motions = ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel'];
  for (const event of events) window.addEventListener(event, invalidate, { capture: true, passive: true });
  for (const event of motions) window.addEventListener(event, motion, true);
  document.fonts?.addEventListener('loadingdone', invalidate);
  return {
    invalidate,
    read(force = false): PointerHit {
      const point = position();
      for (const target of moving.keys()) if (!target.isConnected) moving.delete(target);
      if (!dirty && !force && !moving.size && x === point.x && y === point.y && (!value.surface || value.surface.isConnected) && value.path.every((node, index) => node.shadowRoot === roots[index])) return value;
      x = point.x; y = point.y; dirty = false;
      shadow.disconnect();
      for (const root of roots) root?.removeEventListener('scroll', invalidate, true);
      const surface = document.elementFromPoint(x, y), path = surface ? [surface] : [];
      let inner = surface;
      while (inner?.shadowRoot) {
        shadow.observe(inner.shadowRoot, options);
        const next = inner.shadowRoot.elementFromPoint(x, y);
        if (!next || next === inner) break;
        path.push(next); inner = next;
      }
      roots = path.map(node => node.shadowRoot);
      for (const root of roots) root?.addEventListener('scroll', invalidate, { capture: true, passive: true });
      value = { surface, inner, path };
      return value;
    },
    dispose() {
      mutations.disconnect(); shadow.disconnect(); resize.disconnect();
      for (const root of roots) root?.removeEventListener('scroll', invalidate, true);
      for (const event of events) window.removeEventListener(event, invalidate, true);
      for (const event of motions) window.removeEventListener(event, motion, true);
      document.fonts?.removeEventListener('loadingdone', invalidate); moving.clear();
    }
  };
}
