<script lang="ts">
  import AnimatedNumber from './AnimatedNumber.svelte';
  import ProgressFill from './ProgressFill.svelte';

  let { hits, maximum, reducedMotion = false }: { hits: number; maximum: number; reducedMotion?: boolean } = $props();
  const remaining = $derived(Math.max(0, maximum - hits));
  const percent = $derived(maximum > 0 ? Math.min(100, remaining / maximum * 100) : 100);
</script>

<div class="health-slot" data-destruction-health>
  {#if maximum > 0}
    <div class="health" role="meter" aria-label="File health" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={remaining} aria-valuetext={`${Math.round(percent)}% remaining`}>
      <div class="track"><ProgressFill {percent} reducedMotion={reducedMotion || remaining === 0} direction="decrease" class="health-fill" /></div>
      <span class="label" aria-hidden="true"><AnimatedNumber value={Math.round(percent)} reducedMotion={reducedMotion || remaining === 0} /><span class="unit">%</span></span>
    </div>
  {:else}
    <div class="health unlimited" role="img" aria-label={`Unlimited destruction, ${hits} damaging ${hits === 1 ? 'hit' : 'hits'}. Automatic completion disabled.`}>
      <span class="label" aria-hidden="true">∞</span>
    </div>
  {/if}
</div>

<style>
  .health-slot { flex: 0 1 280px; min-width: 150px; max-width: 320px; padding: 3px 7px; }
  .health { --progress-glow: #fb4c50; position: relative; height: 24px; border: 1px solid #a34d50; border-radius: 999px; background: linear-gradient(#280f15, #100b10); box-shadow: 0 0 0 2px #110b0db3, 0 2px 7px #0005, inset 0 1px 3px #0009; }
  .health::before, .health::after { content: ''; position: absolute; top: 6px; bottom: 6px; width: 3px; border-radius: 2px; background: #e39995; box-shadow: 0 0 5px #c92c3e66; }
  .health::before { left: -6px; transform: skewY(-24deg); }
  .health::after { right: -6px; transform: skewY(24deg); }
  .track { position: absolute; inset: 3px; border-radius: inherit; }
  .track :global(.health-fill) { background: linear-gradient(180deg, #f36768 0%, #d53646 38%, #b71f37 64%, #8c1c30 100%); box-shadow: inset 0 1px 0 #ffb0a680, inset 0 -1px 0 #620b2580, 0 0 7px #d52d4030; }
  .label { position: relative; display: flex; height: 100%; align-items: center; justify-content: center; gap: .08em; color: #fff1eb; font-family: var(--font-mono); font-size: 11px; font-weight: 600; letter-spacing: .04em; line-height: 1; font-variant-numeric: tabular-nums; text-shadow: 0 1px 3px #23030c, 0 0 4px #23030c; }
  .unit { font-size: 9px; opacity: .8; }
  .unlimited .label { font-size: 16px; }
  @container file-header (max-width: 680px) {
    .health-slot { order: 2; flex: 1 0 100%; max-width: none; margin-bottom: 4px; }
  }
</style>
