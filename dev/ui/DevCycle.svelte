<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import Hint from '$lib/components/Hint.svelte';

  let { onclick }: { onclick: () => void } = $props();
</script>

<Hint text="Cycle avatar expression">
  {#snippet children({ props })}
    <Button {...props} variant="ghost" class="avatar-cycle" aria-label="Cycle avatar expression" {onclick} />
  {/snippet}
</Hint>

<style>
  :global(.avatar-cycle) { position: absolute; inset: 0; pointer-events: auto; width: 100%; height: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; }
  :global(.avatar-cycle:is(:hover, :focus-visible)) { background: transparent !important; box-shadow: none !important; }
</style>
