<script lang="ts">
  import { untrack } from 'svelte';
  import { defaultSplashConfig, type SplashConfig } from './playback-config';
  import { createRenderHost } from '$lib/render/host';
  import type { LandscapeState, LandscapeEvent } from './renderer';
  let { paused = false, revealed = true, reducedMotion = false, time, preview = false, lightningCue = 0, onstats, onstatus,
    settings = defaultSplashConfig.landscape }: {
    paused?: boolean;
    revealed?: boolean;
    reducedMotion?: boolean;
    /** Omit for a live clock; opening playback and the workbench share a playhead. */
    time?: number;
    settings?: SplashConfig['landscape'];
    preview?: boolean;
    lightningCue?: number;
    onstats?: (stats: { calls: number; triangles: number; geometries: number; textures: number }) => void;
    onstatus?: (status: 'loading' | 'ready' | 'fallback') => void;
  } = $props();
  let canvas = $state<HTMLCanvasElement>();
  let rendered = $state(false), ready = $state(false), generation = $state(0), forceMain = false;
  let host = $state.raw<ReturnType<typeof createRenderHost<LandscapeState, LandscapeEvent>>>();
  // A reduced-motion scene stays still while the opening audio clock advances.
  let renderTime = $derived(reducedMotion ? 0 : time);
  $effect(() => { host?.update({ settings: $state.snapshot(settings) }); });
  $effect(() => { host?.update({ paused, reducedMotion, time: renderTime, lightningCue, reportStats: !!onstats }); });
  $effect(() => {
    if (!canvas) return;
    const node = canvas;
    return untrack(() => {
      rendered = ready = false; onstatus?.('loading');
      const size = () => ({ width: Math.max(1, node.clientWidth), height: Math.max(1, node.clientHeight), pixelRatio: devicePixelRatio });
      const current = createRenderHost<LandscapeState, LandscapeEvent>({
        kind: 'landscape', canvas: node, forceMain, size: size(),
        state: { settings: $state.snapshot(settings), paused, reducedMotion, time: renderTime, hidden: document.hidden, reportStats: !!onstats },
        fallback: () => { forceMain = true; generation++; },
        failure: () => { ready = true; rendered = false; onstatus?.('fallback'); },
        event(event) {
          if (event.type === 'stats') onstats?.(event.stats);
          else { ready = event.status !== 'loading'; rendered = event.status === 'ready'; onstatus?.(event.status); }
        }
      });
      host = current;
      const resize = () => current.resize(size());
      const observer = new ResizeObserver(resize); observer.observe(node);
      const visibility = () => current.update({ hidden: document.hidden });
      document.addEventListener('visibilitychange', visibility); window.addEventListener('resize', resize);
      return () => {
        current.dispose(); observer.disconnect();
        document.removeEventListener('visibilitychange', visibility); window.removeEventListener('resize', resize);
        if (host === current) host = undefined;
      };
    });
  });
</script>

<div class="splash-landscape" aria-hidden="true"
  style:--scene-fade-duration={`${preview ? 0 : reducedMotion ? 100 : settings.fadeInMs}ms`}
  style:--scene-brightness={settings.opacity}
  style:--scene-sky={settings.lighting.skyColor} style:--scene-horizon={settings.lighting.horizonColor}
  style:--scene-rock={settings.mountains.rockColor} style:--scene-water={settings.water.nearColor}>
  <div class="scene" class:visible={ready && revealed} class:live={time === undefined && revealed}
    style:opacity={time === undefined ? undefined : ready ? reducedMotion || preview ? 1 : Math.min(1, time / Math.max(1, settings.fadeInMs)) : 0}>
    <div class="fallback" class:hidden={rendered}>
      <div class="range distant"></div><div class="range near"></div><div class="water"></div>
    </div>
    {#key generation}<canvas bind:this={canvas} class:rendered></canvas>{/key}
    <div class="atmosphere" class:hidden={rendered}></div>
  </div>
</div>

<style>
  .splash-landscape { position: absolute; inset: 0; overflow: hidden; pointer-events: none; background: #000; }
  .scene { position: absolute; inset: 0; opacity: 0; background: #0a0d09; }
  .scene.visible { opacity: 1; }
  .scene.visible.live { animation: scene-reveal var(--scene-fade-duration) ease-out both; }
  canvas { display: block; width: 100%; height: 100%; opacity: 0; }
  canvas.rendered { opacity: var(--scene-brightness); }
  .fallback { position: absolute; inset: 0; opacity: var(--scene-brightness); background: linear-gradient(var(--scene-sky), var(--scene-horizon) 58%, var(--scene-water) 75%); }
  .fallback.hidden { display: none; }
  .atmosphere.hidden { display: none; }
  .range { position: absolute; inset: 15% -10% 23%; background: var(--scene-rock); clip-path: polygon(0 80%, 7% 46%, 12% 56%, 20% 15%, 25% 38%, 32% 0, 37% 25%, 41% 18%, 48% 63%, 56% 22%, 62% 39%, 70% 7%, 76% 36%, 83% 21%, 91% 55%, 100% 35%, 100% 100%, 0 100%); }
  .range.near { inset: 29% -17% 18%; transform: scaleX(-1); background: color-mix(in srgb, var(--scene-rock), black 35%); }
  .water { position: absolute; inset: 71% 0 0; background: repeating-linear-gradient(178deg, transparent 0 12px, #8a815312 13px, transparent 14px 23px), var(--scene-water); }
  .atmosphere { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 43%, transparent 32%, #0a0d0920 70%, #0a0d0980 100%), linear-gradient(0deg, #0a0d09 0%, transparent 20%, transparent 85%, #0a0d0940 100%); }
  @keyframes scene-reveal { from { opacity: 0; } to { opacity: 1; } }
</style>
