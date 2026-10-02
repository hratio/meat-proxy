<script lang="ts">
  import { untrack } from 'svelte';
  import type { Config } from '$lib/config';
  import { createRenderHost } from '$lib/render/host';
  import type { AirstrikeEvent, AirstrikeState } from '$lib/weapons/airstrike';

  let { target, elapsed, reduced, config, showAircraft, onready }: {
    target: HTMLElement; elapsed: number; reduced: boolean; config: Config; showAircraft: boolean;
    onready: (available: boolean) => void;
  } = $props();
  let canvas = $state<HTMLCanvasElement>();
  let generation = $state(0), forceMain = false;
  let host = $state.raw<ReturnType<typeof createRenderHost<AirstrikeState, AirstrikeEvent>>>();
  const motion = $derived({ elapsed, reduced, showAircraft });
  $effect(() => { host?.update($state.snapshot(motion)); });

  // Stay inside the settings panel's clipping and stacking context, above its scrolling content.
  function portal(node: HTMLElement) {
    target.closest('[data-slot="dialog-content"]')?.appendChild(node);
    return { destroy: () => node.remove() };
  }
  $effect(() => {
    if (!canvas) return;
    const node = canvas;
    return untrack(() => {
      let layoutFrame = 0;
      const size = () => ({ width: Math.max(1, node.clientWidth), height: Math.max(1, node.clientHeight), pixelRatio: devicePixelRatio });
      const bounds = () => {
        const frame = node.getBoundingClientRect(), box = target.getBoundingClientRect();
        return { left: box.left - frame.left, top: box.top - frame.top, width: box.width, height: box.height };
      };
      const current = createRenderHost<AirstrikeState, AirstrikeEvent>({
        kind: 'airstrike', canvas: node, forceMain, size: size(),
        state: { ...$state.snapshot(motion), target: bounds(), weapons: $state.snapshot(config.weapons) },
        event: event => onready(event.available),
        fallback: () => { forceMain = true; generation++; }, failure: () => onready(false)
      });
      host = current;
      const measure = () => { layoutFrame = 0; current.resize(size()); current.update({ target: bounds() }); };
      const schedule = () => { if (!layoutFrame) layoutFrame = requestAnimationFrame(measure); };
      const observer = new ResizeObserver(schedule); observer.observe(node); observer.observe(target);
      window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
      return () => {
        current.dispose(); observer.disconnect(); cancelAnimationFrame(layoutFrame);
        window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true);
        if (host === current) host = undefined;
      };
    });
  });
</script>

<div use:portal class="airstrike-overlay" data-airstrike-overlay data-elapsed={Math.round(elapsed)} data-aircraft-ready={showAircraft} aria-hidden="true">
  {#key generation}<canvas bind:this={canvas}></canvas>{/key}
</div>

<style>
  .airstrike-overlay { position: absolute; inset: 0; z-index: 30; overflow: hidden; pointer-events: none; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
