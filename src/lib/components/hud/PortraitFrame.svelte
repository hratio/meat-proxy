<script lang="ts">
  import type { Snippet } from 'svelte';
  import HudFrame from './HudFrame.svelte';
  let { children, overflow = false, brackets = true, mirrored = false }: { children?: Snippet; overflow?: boolean; brackets?: boolean; mirrored?: boolean } = $props();
</script>

<div class="portrait-module" class:overflow class:standalone={!brackets} class:mirrored>
  {#if brackets}
    <div class="mount left"><HudFrame variant="bracket" /></div>
    <div class="mount right"><HudFrame variant="bracket" mirrored /></div>
  {/if}
  <div class="portrait-shell">
    <HudFrame variant="portrait" {mirrored}>
      <div class="portrait-well">
        {#if children}{@render children()}{:else}
          <svg class="placeholder" viewBox="0 0 160 180" aria-label="Portrait placeholder" role="img">
            <path d="m57 41 17-8 26 7 13 24-3 41-14 20 7 11 28 10 10 34H19l10-34 28-10 6-11-14-20-3-39Z" fill="currentColor" opacity=".2" />
            <path d="m51 67 29 5 29-5-6 16-18 1-5-8-5 8-18-1Z" fill="currentColor" opacity=".75" />
            <path d="M67 105h27M80 11v13M80 151v13M12 88h13m110 0h13" stroke="currentColor" opacity=".5" />
          </svg>
          <span class="slot-label">PORTRAIT SLOT</span>
        {/if}
        <span class="portrait-signal" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
    </HudFrame>
  </div>
</div>

<style>
  .portrait-module { position: relative; height: calc(var(--hud-portrait-height, 214px) + 38px); width: 100%; }
  .portrait-module.standalone { height: 100%; }
  .standalone .portrait-shell { inset: 0; }
  .standalone .portrait-well { clip-path: none; border-radius: 8px; }
  .portrait-module.overflow { z-index: 2; }
  .overflow .portrait-well { overflow: visible; clip-path: none; }
  .portrait-shell { position: absolute; inset: 0 4px; z-index: 1; }
  .portrait-well { position: absolute; inset: 39px 26px 35px 20px; overflow: hidden; clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px); background: radial-gradient(ellipse at 50% 65%, #30303028, transparent 75%); }
  .mirrored .portrait-well { inset: 39px 20px 35px 26px; }
  .mount { position: absolute; bottom: 27px; width: calc(var(--hud-gap, 2px) + 36px); height: 76px; }
  .mount.left { left: calc(-1 * var(--hud-gap, 2px) - 13px); } .mount.right { right: calc(-1 * var(--hud-gap, 2px) - 13px); }
  .placeholder { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--hud-accent, #e9aa59); }
  .slot-label { position: absolute; bottom: 22px; width: 100%; text-align: center; color: var(--tint-a9b8a3); font: 8px var(--mono); letter-spacing: .15em; }
  .portrait-signal { position: absolute; bottom: 12px; right: 13px; display: flex; gap: 2px; align-items: end; }
  .portrait-signal i { display: block; width: 2px; height: 4px; background: var(--hud-art-accent); } .portrait-signal i:nth-child(2) { height: 7px; } .portrait-signal i:nth-child(3) { height: 10px; }
</style>
