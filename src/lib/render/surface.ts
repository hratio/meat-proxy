export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;
export type PaintContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type RenderSize = { width: number; height: number; pixelRatio: number };
export type RenderOptions<State, Event> = {
  canvas: RenderCanvas;
  state: State;
  size: RenderSize;
  timeOrigin: number;
  emit: (event: Event) => void;
  current?: () => boolean;
};
export type RenderEngine<State> = {
  update(patch: Partial<State>): void;
  resize(size: RenderSize): void;
  input?(event: { type: 'keydown' | 'keyup' | 'blur'; code?: string }): void;
  dispose(): void;
};

/** Painting stays in the same realm as the renderer, including editable text. */
export function paintCanvas(width: number, height = width) {
  const element = typeof document === 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  element.width = width; element.height = height;
  const context = element.getContext('2d') as PaintContext | null;
  if (!context) throw new Error('Canvas2D unavailable');
  return { element, context };
}

export const nextFrame = (callback: FrameRequestCallback): number => typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame(callback) : setTimeout(() => callback(performance.now()), 16) as unknown as number;
export const cancelFrame = (frame: number) => typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(frame) : clearTimeout(frame);
export const afterFrame = () => new Promise<void>(resolve => nextFrame(() => setTimeout(resolve, 0)));

/** Event timestamps originate in the window; a worker has a different time origin. */
export function renderClock(timeOrigin: number) {
  const offset = performance.timeOrigin - timeOrigin;
  return { now: () => performance.now() + offset, fromFrame: (time: number) => time + offset };
}
