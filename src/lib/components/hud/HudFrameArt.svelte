<script lang="ts">
  import type { HudFrameArtProps } from '$lib/components/hud/types';
  import MaterialDefs from './MetalDefs.svelte';
  import panel from './assets/blade-runner-panel.webp';
  import panelTint from './assets/blade-runner-panel-tint-mask.webp';
  import panelAccent from './assets/blade-runner-panel-accent-mask.webp';
  import portrait from './assets/blade-runner-portrait.webp';
  import portraitTint from './assets/blade-runner-portrait-tint-mask.webp';
  import portraitAccent from './assets/blade-runner-portrait-accent-mask.webp';

  let { width, height, variant, openEdge }: HudFrameArtProps = $props();
  const uid = $props.id();
  const w = $derived(Math.max(16, width)), h = $derived(Math.max(12, height));
  const upright = $derived(variant === 'portrait');
  const openLeft = $derived(openEdge === 'left'), openTop = $derived(openEdge === 'top');
  const textured = $derived(upright || variant === 'panel' && w > 180 && h > 60);
  const image = $derived(upright ? portrait : panel);
  const tint = $derived(upright ? portraitTint : panelTint);
  const accent = $derived(upright ? portraitAccent : panelAccent);
  const sw = $derived(upright ? 1122 : 1774), sh = $derived(upright ? 1402 : 887);
  const sl = $derived(upright ? 290 : 240), sr = $derived(upright ? 350 : 400);
  const st = $derived(upright ? 390 : 235), sb = $derived(upright ? 390 : 255);
  // Keep the hardware's edge thickness when a code panel collapses. Only its
  // straight middle sections shorten; the shoulders and service plate stay solid.
  const l = $derived(openLeft ? 0 : Math.min(upright ? 25 : 24, w / 4)), r = $derived(Math.min(34, w / 4));
  const t = $derived(openTop ? 0 : Math.min(upright ? 44 : 27, h / 3)), b = $derived(Math.min(upright ? 33 : 26, h / 3));
  const cut = $derived(Math.min(variant === 'inset' ? 3 : 12, h / 3, w / 5));
  const outline = $derived(openLeft ? `M 0 1 H ${w - cut} L ${w - 1} ${cut} V ${h - 1} H 0 Z`
    : openTop ? `M 1 0 H ${w - 1} V ${h - 1} H ${cut} L 1 ${h - cut} Z`
    : `M 1 1 H ${w - cut} L ${w - 1} ${cut} V ${h - 1} H ${cut} L 1 ${h - cut} Z`);
  const edge = $derived(openLeft ? `M 0 1 H ${w - cut} L ${w - 1} ${cut} V ${h - 1} H 0`
    : openTop ? `M ${w - 1} 0 V ${h - 1} H ${cut} L 1 ${h - cut} V 0` : outline);
  const well = $derived(`M ${l * .6} ${t * .7} H ${w - r * .5} V ${h - b * .7} H ${l * .6} Z`);
  const bezel = (pad: number, corner = 8) => {
    const c = Math.max(2, Math.min(corner, h / 4, w / 5));
    return `M ${pad + c} ${pad} H ${w - pad - c} L ${w - pad} ${pad + c} V ${h - pad - c} L ${w - pad - c} ${h - pad} H ${pad + c} L ${pad} ${h - pad - c} V ${pad + c} Z`;
  };
</script>

{#snippet piece(x: number, y: number, width: number, height: number, sx: number, sy: number, widthSource: number, heightSource: number)}
  {#if width > 0 && height > 0}
    <svg {x} {y} {width} {height} viewBox={`${sx} ${sy} ${widthSource} ${heightSource}`} preserveAspectRatio="none" overflow="hidden">
      <use href={`#${uid}-hardware`} />
    </svg>
  {/if}
{/snippet}

<svg class="frame-art" data-hud-art="blade-runner" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
  <MaterialDefs id={uid} />
  <defs>
    <linearGradient id={`${uid}-deck`} x2="0" y2="1">
      <stop stop-color="color-mix(in srgb, var(--hud-art-top) 70%, #070707)" />
      <stop offset="1" stop-color="var(--hud-art-bottom)" />
    </linearGradient>
    <linearGradient id={`${uid}-display`} x2="0" y2="1">
      <stop stop-color="var(--blade-display-top, #101010)" />
      <stop offset="1" stop-color="var(--blade-display-bottom, #070707)" />
    </linearGradient>
    <pattern id={`${uid}-alloy`} width="1" height="1" patternContentUnits="objectBoundingBox">
      <g style="isolation: isolate">
        <svg width="1" height="1" viewBox="1130 57 330 58" preserveAspectRatio="none" overflow="hidden"><image href={panel} width="1774" height="887" /></svg>
        <rect width="1" height="1" fill="var(--ui-tint)" style="mix-blend-mode: color; opacity: var(--hud-art-tint-strength)" />
      </g>
    </pattern>
  </defs>
  {#if variant === 'bracket'}
    <g class="surface-detail">
      <path d={bezel(.5, 7)} fill="var(--hud-art-shadow)" stroke="#030303" stroke-width="2" />
      <path d={bezel(2, 6)} fill={`url(#${uid}-metal)`} stroke="var(--hud-art-edge)" stroke-width=".8" />
      <path d={bezel(5, 4)} fill={`url(#${uid}-alloy)`} />
      <path d={`M 3 ${h - 10} V 9 L 9 3 H ${w - 9}`} fill="none" stroke="var(--hud-art-highlight)" opacity=".5" />
      <path d={`M 7 ${h - 4} H ${w - 8} L ${w - 3} ${h - 9} V 9`} fill="none" stroke="#020202" stroke-width="2" />
      <path d={`M 8 ${h * .43} H ${w - 7} M 8 ${h * .5} H ${w - 7} M 8 ${h * .57} H ${w - 7}`} stroke="#030303" stroke-width="3" />
      <path d={`M 8 ${h * .43 + 2} H ${w - 7} M 8 ${h * .5 + 2} H ${w - 7} M 8 ${h * .57 + 2} H ${w - 7}`} stroke="var(--hud-art-edge)" stroke-width=".7" opacity=".65" />
      {#each [15, h - 15] as y}
        <circle cx="12" cy={y} r="4" fill="#050505" stroke="var(--hud-art-edge)" stroke-width=".6" />
        <circle cx="12" cy={y} r="2.5" fill={`url(#${uid}-bolt)`} />
        <path d={`M 10 ${y + 1} L 14 ${y - 1}`} stroke="#020202" stroke-width="1.2" />
      {/each}
    </g>
  {:else if variant === 'inset'}
    <g class="surface-detail">
      <path d={bezel(.5, 6)} fill="#020202" stroke="var(--hud-art-edge)" stroke-width=".6" />
      <path d={bezel(1.5, 5)} fill={`url(#${uid}-metal)`} />
      <path d={`${bezel(1.5, 5)} ${bezel(5, 3)}`} fill-rule="evenodd" fill={`url(#${uid}-alloy)`} />
      <path d={`M 1.5 ${h - 8} V 8 L 8 1.5 H ${w - 8}`} fill="none" stroke="var(--hud-art-highlight)" stroke-width=".8" opacity=".45" />
      <path d={bezel(3.5, 4)} fill="#020202" stroke="#080808" stroke-width=".7" />
      <path d={bezel(5.5, 2.5)} fill={`url(#${uid}-display)`} />
      <path d={`M 5.5 ${h - 8} L 8 ${h - 5.5} H ${w - 8} L ${w - 5.5} ${h - 8} V 8`} fill="none" stroke="var(--hud-art-edge)" stroke-width=".7" opacity=".65" />
      <path d={`M 12 2 H 24 M ${w - 24} ${h - 2} H ${w - 12}`} stroke="var(--hud-art-edge)" stroke-width=".8" />
    </g>
  {:else if textured}
    <defs>
      <mask id={`${uid}-tint`} maskUnits="userSpaceOnUse" x="0" y="0" width={sw} height={sh} style="mask-type: alpha"><image href={tint} width={sw} height={sh} /></mask>
      <mask id={`${uid}-accent`} maskUnits="userSpaceOnUse" x="0" y="0" width={sw} height={sh} style="mask-type: alpha"><image href={accent} width={sw} height={sh} /></mask>
      <g id={`${uid}-hardware`} style="isolation: isolate">
        <image href={image} width={sw} height={sh} />
        <rect width={sw} height={sh} fill="var(--ui-tint)" mask={`url(#${uid}-tint)`} style="mix-blend-mode: color; opacity: var(--hud-art-tint-strength)" />
        <!-- Lamp glass follows the theme accent directly, independently of the
             surface tint strength and the source image's authoring colors. -->
        <rect class="accent-lamps" width={sw} height={sh} fill="var(--hud-art-accent)" mask={`url(#${uid}-accent)`} />
      </g>
    </defs>
    <path class="well" d={well} fill={`url(#${uid}-${upright ? 'well' : 'deck'})`} />
    <g class="surface-detail">
      {@render piece(0, 0, l, t, 0, 0, sl, st)}
      {@render piece(w - r, 0, r, t, sw - sr, 0, sr, st)}
      {@render piece(0, h - b, l, b, 0, sh - sb, sl, sb)}
      {@render piece(w - r, h - b, r, b, sw - sr, sh - sb, sr, sb)}
      {@render piece(l, 0, w - l - r, t, sl, 0, sw - sl - sr, st)}
      {@render piece(l, h - b, w - l - r, b, sl, sh - sb, sw - sl - sr, sb)}
      {@render piece(0, t, l, h - t - b, 0, st, sl, sh - st - sb)}
      {@render piece(w - r, t, r, h - t - b, sw - sr, st, sr, sh - st - sb)}
    </g>
  {:else}
    <g class="surface-detail">
      <path d={outline} fill={`url(#${uid}-well)`} />
      <path d={edge} fill="none" stroke="var(--hud-art-edge)" stroke-width=".8" />
      <path d={openLeft ? `M 0 2 H ${w - cut}` : openTop ? `M 2 ${h - cut} V 0` : `M 2 ${h - cut} V 2 H ${w - cut}`} fill="none" stroke="var(--hud-art-top)" stroke-width="4" />
      <path d={`M ${w - 5} ${cut + 5} V ${h - 6} M ${w - 9} ${cut + 5} V ${h - 6}`} stroke="var(--hud-art-metal)" stroke-width="2" />
      {#if !openTop}<path d={`M 14 5 H ${Math.max(18, Math.min(w - 20, w * .3))}`} stroke="var(--hud-art-accent)" stroke-width="1.3" />{/if}
    </g>
  {/if}
  <path class="wire-outline" d={edge} fill="none" stroke="var(--hud-art-accent)" />
</svg>

<style>
  .frame-art { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .wire-outline { display: none; }
  :global(.hud-wireframe) .surface-detail, :global(.hud-wireframe) .well { display: none; }
  :global(.hud-wireframe) .wire-outline { display: block; }
</style>
