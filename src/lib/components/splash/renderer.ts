import { createLandscape } from './landscape';
import type { LandscapeConfig } from './landscape-config';
import { landscapeGeometryKey } from './landscape-math';
import { nextFrame, cancelFrame, renderClock, type RenderEngine, type RenderOptions } from '../../render/surface';

export type LandscapeState = { settings: LandscapeConfig; paused: boolean; reducedMotion: boolean; hidden: boolean; time?: number; reportStats: boolean; lightningCue?: number };
export type LandscapeEvent = { type: 'status'; status: 'loading' | 'ready' | 'fallback' }
  | { type: 'stats'; stats: { calls: number; triangles: number; geometries: number; textures: number } };

export function createLandscapeRenderer(options: RenderOptions<LandscapeState, LandscapeEvent>): RenderEngine<LandscapeState> {
  let state = { ...options.state }, size = options.size;
  const { emit } = options, clock = renderClock(options.timeOrigin);
  let view: Awaited<ReturnType<typeof createLandscape>> | undefined;
  let disposed = false, lost = false, frame = 0, previous = 0, elapsed = 0, lastStats = 0, lastSlot = -1, rendered = false;
  let rebuild: ReturnType<typeof setTimeout> | undefined, generation = landscapeGeometryKey(state.settings);
  function draw(throttle = false) {
    if (!view || disposed || lost || state.hidden) return;
    const now = clock.now();
    // Fixed wall-clock slots tolerate jitter in the external clock's delivery.
    const slot=Math.floor(now*state.settings.quality.fps/1000);
    if (throttle && slot===lastSlot) return;
    lastSlot=slot;
    const seconds = state.reducedMotion ? 0 : (state.time ?? elapsed) / 1000;
    view.render(seconds, state.reducedMotion, state.paused);
    if (!rendered) { rendered = true; emit({ type: 'status', status: 'ready' }); }
    if (state.reportStats && now - lastStats > 400) { lastStats = now; emit({ type: 'stats', stats: view.stats() }); }
  }
  function animate(stamp: number) {
    const now = clock.fromFrame(stamp);
    frame = nextFrame(animate);
    const delta = previous ? Math.max(0, Math.min(100, now - previous)) : 0;
    previous = now; elapsed += delta; draw(true);
  }
  function playback() {
    cancelFrame(frame); frame = 0; previous = 0;
    if (!view || disposed || lost || state.hidden) return;
    draw(state.time !== undefined && !state.paused && !state.reducedMotion);
    if (state.time === undefined && !state.paused && !state.reducedMotion) frame = nextFrame(animate);
  }
  function contextLost(event: Event) { event.preventDefault(); lost = true; rendered = false; cancelFrame(frame); emit({ type: 'status', status: 'fallback' }); }
  // Three.js restores its context in a later listener on the same event.
  function contextRestored() { lost = false; queueMicrotask(playback); }
  options.canvas.addEventListener('webglcontextlost', contextLost);
  options.canvas.addEventListener('webglcontextrestored', contextRestored);
  emit({ type: 'status', status: 'loading' });
  void createLandscape(options.canvas, state.settings, size.pixelRatio, () => !disposed).then(async created => {
    if (disposed) { created.dispose(); return; }
    view = created; view.configure(state.settings); generation = landscapeGeometryKey(state.settings);
    view.resize(size.width, size.height, size.pixelRatio);
    await view.prepare();
    if (!disposed) playback();
  }).catch(() => {
    if (disposed) return;
    view?.dispose(); view = undefined; emit({ type: 'status', status: 'fallback' });
  });
  return {
    update(patch) {
      if (patch.lightningCue !== undefined && patch.lightningCue !== state.lightningCue) view?.previewLightning(patch.lightningCue, patch.paused ?? state.paused);
      state = { ...state, ...patch };
      if (patch.settings && view) {
        clearTimeout(rebuild);
        const apply = () => {
          if (disposed || !view) return;
          view.configure(state.settings); generation = landscapeGeometryKey(state.settings);
          view.resize(size.width, size.height, size.pixelRatio); playback();
        };
        if (generation !== landscapeGeometryKey(state.settings)) rebuild = setTimeout(apply, 140); else apply();
      } else playback();
    },
    resize(next) { size = next; view?.resize(size.width, size.height, size.pixelRatio); draw(); },
    dispose() {
      disposed = true; cancelFrame(frame); clearTimeout(rebuild); view?.dispose();
      options.canvas.removeEventListener('webglcontextlost', contextLost); options.canvas.removeEventListener('webglcontextrestored', contextRestored);
    }
  };
}
