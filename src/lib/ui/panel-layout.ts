type Position = { x: number; y: number };
type Size = { width: number; height: number };
type Layout = Position & Partial<Size>;
type Gesture = {
  pointerId: number;
  handle: HTMLElement;
  mode: 'drag' | 'resize';
  clientX: number;
  clientY: number;
  position: Position;
  size: Size;
  preferredSize?: Size;
};

const margin = 16;
const minWidth = 560;
const minHeight = 320;
const interactive = 'button, a, input, select, textarea, [contenteditable], [role="button"], [role="slider"], [role="switch"]';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function readLayout(key: string): Layout | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
    const size = Number.isFinite(value.width) && value.width > 0 && Number.isFinite(value.height) && value.height > 0
      ? { width: value.width, height: value.height } : {};
    return { x: value.x, y: value.y, ...size };
  } catch { return; }
}

function attachLayout(node: HTMLElement, id: string) {
  const storageKey = `meat-proxy:panel-layout:v1:${id}`;
  const originalStyle = node.getAttribute('style');
  const saved = readLayout(storageKey);
  const initial = node.getBoundingClientRect();
  let position: Position = saved ? { x: saved.x, y: saved.y } : { x: initial.left, y: initial.top };
  let preferredSize: Size | undefined = saved?.width && saved.height ? { width: saved.width, height: saved.height } : undefined;
  let gesture: Gesture | undefined;
  let viewport = { width: innerWidth, height: innerHeight };

  // Use one coordinate system from mount onward. Updating the transform directly
  // keeps pointer movement out of Svelte's render cycle and CSS transitions.
  node.style.left = '0';
  node.style.top = '0';
  node.style.translate = 'none';

  function place(next: Position, size: Size) {
    position = {
      x: clamp(next.x, margin, Math.max(margin, viewport.width - size.width - margin)),
      y: clamp(next.y, margin, Math.max(margin, viewport.height - size.height - margin)),
    };
    node.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
  }

  function applySize() {
    if (preferredSize) {
      const maxWidth = Math.max(0, viewport.width - margin * 2);
      const maxHeight = Math.max(0, viewport.height - margin * 2);
      node.style.width = `${clamp(preferredSize.width, Math.min(minWidth, maxWidth), maxWidth)}px`;
      node.style.height = `${clamp(preferredSize.height, Math.min(minHeight, maxHeight), maxHeight)}px`;
    } else {
      node.style.removeProperty('width');
      node.style.removeProperty('height');
    }
  }

  function fit() {
    if (gesture) return;
    viewport = { width: innerWidth, height: innerHeight };
    applySize();
    place(position, { width: node.offsetWidth, height: node.offsetHeight });
  }

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({ ...position, ...preferredSize })); }
    catch { /* Dragging remains available when browser storage is disabled. */ }
  }

  function resize(width: number, height: number) {
    const maxWidth = Math.max(0, viewport.width - position.x - margin);
    const maxHeight = Math.max(0, viewport.height - position.y - margin);
    preferredSize = {
      width: clamp(width, Math.min(minWidth, maxWidth), maxWidth),
      height: clamp(height, Math.min(minHeight, maxHeight), maxHeight),
    };
    applySize();
  }

  function pointerDown(event: PointerEvent) {
    if (gesture || event.button !== 0 || !event.isPrimary || !(event.target instanceof Element)) return;
    const handle = event.target.closest<HTMLElement>('[data-panel-drag], [data-panel-resize]');
    if (!handle || !node.contains(handle)) return;
    const mode = handle.hasAttribute('data-panel-resize') ? 'resize' : 'drag';
    if (mode === 'drag' && event.target.closest(interactive)) return;
    fit();
    gesture = {
      pointerId: event.pointerId, handle, mode, clientX: event.clientX, clientY: event.clientY,
      position: { ...position }, size: { width: node.offsetWidth, height: node.offsetHeight },
      preferredSize: preferredSize && { ...preferredSize },
    };
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    node.style.willChange = mode === 'drag' ? 'transform' : 'width, height';
    event.preventDefault();
    event.stopPropagation();
  }

  function pointerMove(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.clientX, dy = event.clientY - gesture.clientY;
    if (gesture.mode === 'drag') {
      place({ x: gesture.position.x + dx, y: gesture.position.y + dy }, gesture.size);
    } else {
      resize(gesture.size.width + dx, gesture.size.height + dy);
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function finish(cancelled: boolean) {
    if (!gesture) return;
    const previous = gesture;
    gesture = undefined;
    if (cancelled) {
      position = previous.position;
      preferredSize = previous.preferredSize;
    }
    node.style.removeProperty('will-change');
    if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
    fit();
    if (!cancelled) persist();
  }

  function pointerUp(event: PointerEvent) {
    if (gesture?.pointerId !== event.pointerId) return;
    pointerMove(event);
    finish(false);
  }

  function pointerCancel(event: PointerEvent) {
    if (gesture?.pointerId === event.pointerId) finish(true);
  }

  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !gesture) return;
    // Cancel the gesture before the dialog's Escape handler can close it.
    event.preventDefault();
    event.stopImmediatePropagation();
    finish(true);
  }

  function moveWithKeys(event: KeyboardEvent) {
    if (gesture || !(event.target instanceof HTMLElement) || !event.target.matches('[data-panel-drag], [data-panel-resize]')) return;
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    fit();
    const step = event.shiftKey ? 50 : 10;
    const dx = direction[0] * step, dy = direction[1] * step;
    const size = { width: node.offsetWidth, height: node.offsetHeight };
    if (event.target.hasAttribute('data-panel-resize')) resize(size.width + dx, size.height + dy);
    else place({ x: position.x + dx, y: position.y + dy }, size);
    persist();
  }

  const cancel = () => finish(true);
  const windowResize = () => { cancel(); fit(); };
  const observer = new ResizeObserver(fit);
  fit();
  observer.observe(node);
  node.addEventListener('pointerdown', pointerDown);
  node.addEventListener('pointermove', pointerMove);
  node.addEventListener('pointerup', pointerUp);
  node.addEventListener('pointercancel', pointerCancel);
  node.addEventListener('lostpointercapture', pointerCancel);
  node.addEventListener('keydown', moveWithKeys);
  window.addEventListener('keydown', escape, true);
  window.addEventListener('resize', windowResize);
  window.addEventListener('blur', cancel);

  return () => {
    cancel();
    observer.disconnect();
    node.removeEventListener('pointerdown', pointerDown);
    node.removeEventListener('pointermove', pointerMove);
    node.removeEventListener('pointerup', pointerUp);
    node.removeEventListener('pointercancel', pointerCancel);
    node.removeEventListener('lostpointercapture', pointerCancel);
    node.removeEventListener('keydown', moveWithKeys);
    window.removeEventListener('keydown', escape, true);
    window.removeEventListener('resize', windowResize);
    window.removeEventListener('blur', cancel);
    if (originalStyle === null) node.removeAttribute('style');
    else node.setAttribute('style', originalStyle);
  };
}

export function panelLayout(node: HTMLElement, key?: string) {
  let current = key;
  let dispose = key ? attachLayout(node, key) : undefined;
  return {
    update(next?: string) {
      if (next === current) return;
      dispose?.();
      current = next;
      dispose = next ? attachLayout(node, next) : undefined;
    },
    destroy() { dispose?.(); },
  };
}
