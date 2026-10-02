<script lang="ts">
  import { Check, Crosshair, LoaderCircle } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';

  let { selected, pending = false, disabled = false, ontoggle }: {
    selected: boolean; pending?: boolean; disabled?: boolean; ontoggle: () => void;
  } = $props();
</script>

<Button variant="outline" {selected} disabled={disabled || pending} onclick={ontoggle}
  aria-label="Use for destruction" aria-pressed={selected} aria-busy={pending}
  title={selected ? 'Clear this destruction mark' : 'Use this when a file is destroyed; replaces the current selection'}
  class={['ml-auto h-16 gap-3 px-4 text-left', selected && 'border-primary bg-primary/10 text-primary']}>
  {#if pending}<LoaderCircle class="size-7 animate-spin motion-reduce:animate-none" />
  {:else if selected}<Check class="size-7" strokeWidth={3} />
  {:else}<Crosshair class="size-7" />{/if}
  <span class="grid gap-0.5">
    <span>{selected ? 'Destruction selected' : 'Use for destruction'}</span>
    <span class="text-xs font-normal text-muted-foreground">On file completion</span>
  </span>
</Button>
