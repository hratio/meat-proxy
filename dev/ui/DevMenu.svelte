<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import { Button } from '$lib/components/ui/button';
  import Hint from '$lib/components/Hint.svelte';

  let { open, onclick }: { open: boolean; onclick: () => void } = $props();
</script>

<Hint text="Development tools">
  {#snippet children({ props })}
    <Button {...mergeProps(props, { onclick })} variant="outline" class="text-xs" aria-label="Toggle development tools" aria-pressed={open}>DEV</Button>
  {/snippet}
</Hint>
