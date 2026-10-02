<script lang="ts">
  import MetalDefs from './MetalDefs.svelte';
  let { width, height, leftWidth, leftHeight, rightWidth, rightHeight, centerHeight, gap, railHeight = 22 }: {
    width: number; height: number; leftWidth: number; leftHeight: number;
    rightWidth: number; rightHeight: number; centerHeight: number; gap: number; railHeight?: number;
  } = $props();
  const uid = $props.id();
  let leftTop = $derived(Math.max(4, height - railHeight - gap - leftHeight));
  let rightTop = $derived(Math.max(4, height - railHeight - gap - rightHeight));
  let centerTop = $derived(Math.max(2, height - railHeight - gap - centerHeight));
  let cx1 = $derived(leftWidth + gap), cx2 = $derived(width - rightWidth - gap);
  let outline = $derived(`M 1 ${leftTop + 20} L 20 ${leftTop} H ${leftWidth - 12} L ${leftWidth + 2} ${leftTop + 14} H ${cx1 + 10} V ${centerTop + 28} L ${cx1 + 38} ${centerTop} H ${cx2 - 38} L ${cx2 - 10} ${centerTop + 28} V ${rightTop + 14} H ${width - rightWidth - 2} L ${width - rightWidth + 12} ${rightTop} H ${width - 20} L ${width - 1} ${rightTop + 20} V ${height - 1} H 1 Z`);
</script>

<svg class="chassis" viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <MetalDefs id={uid} />
  <path d={outline} fill={`url(#${uid}-metal)`} stroke="var(--tint-020503)" stroke-width="3" />
  <path d={outline} fill={`url(#${uid}-grain)`} opacity=".85" />
  <path d={outline} fill="none" stroke="var(--hud-edge, var(--tint-777668))" stroke-width="1" />
  <path d={`M ${leftWidth + gap / 2} ${leftTop + 22} V ${height - railHeight} M ${width - rightWidth - gap / 2} ${rightTop + 22} V ${height - railHeight}`} stroke="var(--tint-010402)" stroke-width="2" />
</svg>

<style>
  .chassis { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; }
  :global(.hud-wireframe) .chassis path { fill: none; stroke: var(--hud-accent, #e9aa59); opacity: .35; }
</style>
