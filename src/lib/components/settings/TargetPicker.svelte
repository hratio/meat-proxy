<script lang="ts">
  import type { Config } from '$lib/config';
  import { targetOptions, type TargetArtworkId } from '$lib/targets/config';
  import StoneTablet from '../StoneTablet.svelte';
  import { Button } from '$lib/components/ui/button';

  let { value = $bindable(), config }: { value: TargetArtworkId; config: Config } = $props();
  let hovered = $state<TargetArtworkId>();
  const preview = $derived({ ...config, display: { ...config.display, reducedMotion: true } });
</script>

<div class="@container grid gap-5" data-target-picker>
  <div class="grid grid-cols-1 gap-3 @min-[25rem]:grid-cols-3" role="group" aria-label="Shooting target">
    {#each targetOptions as option}
      {@const sample = { ...preview, targets: { ...preview.targets, artwork: option.id } }}
      <Button variant="outline" class={['h-auto min-w-0 flex-col gap-1 px-3 py-4', value === option.id && 'border-primary bg-primary/10']}
        aria-label={option.label} aria-pressed={value === option.id} onclick={() => value = option.id}
        onpointerenter={() => hovered = option.id} onpointerleave={() => hovered = undefined}
        onfocus={() => hovered = option.id} onblur={() => hovered = undefined}>
        <span class="block size-24 shrink-0"><StoneTablet config={sample} hovered={hovered === option.id} /></span>
        <span class="font-medium">{option.label}</span>
        <span class="text-xs font-normal text-muted-foreground">{option.description}</span>
      </Button>
    {/each}
  </div>
  <div class="flex items-center justify-center gap-2 rounded-md border border-border bg-background/50 p-4" aria-label="Selected target preview">
    {#each ['Idle', 'Hover', 'Completed'] as state}
      <figure class="grid justify-items-center gap-2">
        <div class="size-21"><StoneTablet config={{ ...preview, targets: { ...preview.targets, artwork: value } }} hovered={state === 'Hover'} cleared={state === 'Completed'} /></div>
        <figcaption class="text-xs text-muted-foreground">{state}</figcaption>
      </figure>
    {/each}
  </div>
</div>
