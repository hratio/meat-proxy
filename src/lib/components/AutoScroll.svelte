<script lang="ts">
  import { Pause, Play, ChevronDown, Gauge } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Popover from '$lib/components/ui/popover';
  import * as Toggle from '$lib/components/ui/toggle';
  import { Slider } from '$lib/components/ui/slider';

  let { active = $bindable(false), speed, onspeed }: { active?: boolean; speed: number; onspeed: (speed: number) => Promise<void> } = $props();
  let draft = $state(50), pending = $state(false);
  $effect(() => { draft = speed; });
  async function save(value: number) {
    pending = true;
    try { await onspeed(value); } finally { draft = speed; pending = false; }
  }
</script>

<div class="flex shrink-0 items-center gap-0.5" role="group" aria-label="Automatic scrolling">
  <Toggle.Root aria-label="Auto-scroll" bind:pressed={active} class="gap-1.5 data-[state=on]:text-foreground">{#if active}<Pause />{:else}<Play />{/if}Auto-scroll</Toggle.Root>
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}<Button {...props} variant="ghost" size="icon-xs" aria-label="Auto-scroll speed"><ChevronDown class="size-3.5" /></Button>{/snippet}
    </Popover.Trigger>
    <Popover.Content variant="panel" align="end" sideOffset={10} class="w-64 gap-4 p-4" aria-label="Auto-scroll speed">
      <div class="flex items-center gap-2"><Gauge class="size-4 text-muted-foreground" /><span class="flex-1 text-sm font-medium">Scroll speed</span><span class="text-xs text-muted-foreground tabular-nums">{draft} px/s</span></div>
      <Slider type="single" min={5} max={500} step={5} bind:value={draft} onValueCommit={save} disabled={pending} thumbLabel="Scroll speed" class="my-2" />
    </Popover.Content>
  </Popover.Root>
</div>
