<script lang="ts">
  import { onMount } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import type { Config } from '$lib/config';
  import { useDestruction } from '$lib/destruction/context';
  import { createCharacterDebris } from '$lib/destruction/particles';
  let { config, paused = false }: { config: Config; paused?: boolean } = $props();
  const destruction = useDestruction();
  let canvas: HTMLCanvasElement;
  let renderer: ReturnType<typeof createCharacterDebris> | undefined;
  $effect(() => { if (paused || config.display.reducedMotion || prefersReducedMotion.current) renderer?.clear(); });
  export function clear() { renderer?.clear(); }
  onMount(() => {
    renderer = createCharacterDebris(canvas, () => ({ ...config.destruction, paused,
      reducedMotion: config.display.reducedMotion || prefersReducedMotion.current,
      pixelRatio: config.weapons.pixelRatio, fps: Math.min(60, config.weapons.fps) }));
    const detach = destruction?.addEffect(renderer.emit);
    return () => { detach?.(); renderer?.dispose(); };
  });
</script>

<canvas bind:this={canvas} class="pointer-events-none fixed inset-0 z-70 size-full" data-destruction-debris aria-hidden="true"></canvas>
