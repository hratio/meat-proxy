<script lang="ts">
  let { text }: { text: string } = $props();
  let available = $state(0), natural = $state(0);
  const scale = $derived(natural ? Math.max(.8, Math.min(1, (available - 1) / natural)) : 1);
</script>

<span class="fitted-title" title={text} bind:clientWidth={available}>
  <span class="measure" aria-hidden="true" bind:clientWidth={natural}>{text}</span>
  <span class="label" style:font-size={`calc(var(--hud-title-size, 14px) * ${scale})`}>{text}</span>
</span>

<style>
  .fitted-title { position: relative; display: block; min-width: 0; overflow: hidden; white-space: nowrap; }
  .measure { position: absolute; width: max-content; visibility: hidden; font-size: var(--hud-title-size, 14px); }
  .label { display: block; overflow: hidden; text-overflow: ellipsis; }
</style>
