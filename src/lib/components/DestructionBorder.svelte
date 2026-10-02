<script lang="ts">
  import type { Config } from '$lib/config';
  let { settings, reducedMotion, paused = false }: { settings: Config['destruction']; reducedMotion: boolean; paused?: boolean } = $props();
</script>

<div class="destruction-border" data-destruction-border={settings.borderStyle} class:still={reducedMotion || paused} style:--destruction-color={settings.color} aria-hidden="true">
  {#if settings.borderStyle === 'lock'}
    <div class="outline"></div>
    {#each [0, 1, 2, 3] as corner}<i class="corner" data-corner={corner}></i>{/each}
    <span class="scanner"></span>
  {:else if settings.borderStyle === 'glow'}
    <div class="glow"></div>
  {:else}
    {#each ['top', 'right', 'bottom', 'left'] as edge}<span class={`dash ${edge}`}></span>{/each}
  {/if}
</div>

<style>
  .destruction-border { position: absolute; inset: -1px; z-index: 14; pointer-events: none; color: var(--destruction-color); border-radius: 4px; }
  .outline, .glow { position: absolute; inset: 0; border: 1px solid currentColor; border-radius: inherit; }
  .outline { opacity: .45; }
  .corner { position: absolute; width: 22px; height: 22px; border: 3px solid currentColor; animation: lock 1.8s ease-in-out infinite alternate; }
  .corner[data-corner='0'] { top: -2px; left: -2px; border-right: 0; border-bottom: 0; }
  .corner[data-corner='1'] { top: -2px; right: -2px; border-left: 0; border-bottom: 0; }
  .corner[data-corner='2'] { bottom: -2px; right: -2px; border-left: 0; border-top: 0; }
  .corner[data-corner='3'] { bottom: -2px; left: -2px; border-right: 0; border-top: 0; }
  .scanner { position: absolute; top: -1px; left: calc(50% - 24px); width: 48px; height: 3px; background: currentColor; box-shadow: 0 0 8px currentColor; animation: scan 2s ease-in-out infinite alternate; }
  .glow { box-shadow: 0 0 12px color-mix(in srgb, currentColor 55%, transparent), inset 0 0 5px color-mix(in srgb, currentColor 25%, transparent); animation: glow 1.6s ease-in-out infinite alternate; }
  /* Translate narrow, cached strips. Animating a file-sized SVG dash offset
     repainted every visible edge and raised GPU-process CPU in the benchmark. */
  .dash { position: absolute; overflow: hidden; }
  .dash::before { content: ''; position: absolute; }
  .top, .bottom { height: 2px; left: 0; right: 0; }
  .top { top: 0; } .bottom { bottom: 0; }
  .left, .right { width: 2px; top: 0; bottom: 0; }
  .left { left: 0; } .right { right: 0; }
  .top::before, .bottom::before { inset: 0 -36px; background: repeating-linear-gradient(90deg, currentColor 0 8px, transparent 8px 18px); animation: dash-x 1.5s linear infinite; }
  .left::before, .right::before { inset: -36px 0; background: repeating-linear-gradient(0deg, currentColor 0 8px, transparent 8px 18px); animation: dash-y 1.5s linear infinite; }
  .bottom::before, .left::before { animation-direction: reverse; }
  .still *, .still *::before { animation: none; }
  @keyframes lock { from { opacity: .55; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
  @keyframes scan { from { transform: translateX(-40px); opacity: .6; } to { transform: translateX(40px); opacity: 1; } }
  @keyframes glow { from { opacity: .45; } to { opacity: 1; } }
  @keyframes dash-x { to { transform: translateX(18px); } }
  @keyframes dash-y { to { transform: translateY(18px); } }
  @media (prefers-reduced-motion: reduce) { .destruction-border *, .destruction-border *::before { animation: none; } }
</style>
