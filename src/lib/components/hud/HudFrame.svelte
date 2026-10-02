<script lang="ts">
  import type { Snippet } from 'svelte';
  import FrameArt from './HudFrameArt.svelte';
  import type { HudFrameEdge, HudFrameVariant } from './types';

  let { children, variant = 'panel', mirrored = false, openEdge }: {
    children?: Snippet;
    variant?: HudFrameVariant;
    mirrored?: boolean;
    openEdge?: HudFrameEdge;
  } = $props();

  let width = $state(320), height = $state(180);
</script>

<div class="hud-frame" class:inset={variant === 'inset'} class:mirrored data-frame={variant} data-open-edge={openEdge} bind:clientWidth={width} bind:clientHeight={height}>
  <FrameArt {width} {height} {variant} {openEdge} />
  <div class="frame-content">{@render children?.()}</div>
</div>

<style>
  .hud-frame { position: relative; width: 100%; height: 100%; min-width: 0; isolation: isolate; }
  .hud-frame.mirrored > :global(.frame-art) { transform: scaleX(-1); }
  .frame-content { position: relative; width: 100%; height: 100%; min-width: 0; }
</style>
