<script lang="ts">
  import { Ban, MousePointer2, Plus } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Slider } from '$lib/components/ui/slider';
  import { crosshairImage, crosshairSize, customCrosshairs, defaultCrosshair, type CrosshairConfig } from '$lib/crosshair';
  import { colorOpacityPercent, withColorOpacity } from '$lib/ui/user-colors';

  let { value = $bindable() }: { value: CrosshairConfig } = $props();
  const custom = $derived(value.pattern !== 'default' && value.pattern !== 'system');
  function opacity(percent: number) {
    if (Number.isFinite(percent)) value.color = withColorOpacity(value.color, percent);
  }
</script>

<div class="grid gap-6" data-crosshair-picker>
  <div class="grid size-32 place-items-center justify-self-center rounded-lg border border-border bg-[color-mix(in_srgb,var(--background)_90%,var(--foreground)_10%)]" data-crosshair-preview role="img" aria-label="Crosshair preview">
    {#if value.pattern === 'default'}
      <MousePointer2 class="size-6 text-foreground" />
    {:else if value.pattern === 'system'}
      <Plus class="size-6 text-foreground" strokeWidth={1} />
    {:else}
      <img src={crosshairImage(value.pattern, value.color, value.sizePx)} alt="" width={value.sizePx} height={value.sizePx} draggable="false" />
    {/if}
  </div>
  <div class="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Crosshair pattern">
    <Button variant="ghost" size="icon-tile" class={value.pattern === 'default' ? 'border-primary' : ''} aria-label="Browser default" title="Browser default" aria-pressed={value.pattern === 'default'} onclick={() => value.pattern = 'default'}><Ban class="size-6 text-muted-foreground" /></Button>
    <Button variant="ghost" size="icon-tile" class={value.pattern === 'system' ? 'border-primary' : ''} aria-label="OS crosshair" title="OS crosshair" aria-pressed={value.pattern === 'system'} onclick={() => value.pattern = 'system'}><Plus class="size-6" strokeWidth={1} /></Button>
    {#each customCrosshairs as pattern}
      <Button variant="ghost" size="icon-tile" class={['p-0', value.pattern === pattern.id && 'border-primary']} aria-label={pattern.label} title={pattern.label} aria-pressed={value.pattern === pattern.id} onclick={() => value.pattern = pattern.id}>
        <img src={crosshairImage(pattern.id, defaultCrosshair.color)} alt="" width={defaultCrosshair.sizePx} height={defaultCrosshair.sizePx} class="shrink-0" draggable="false" />
      </Button>
    {/each}
  </div>
  <div class="grid grid-cols-[minmax(64px,1fr)_minmax(0,2fr)] items-stretch gap-6" data-crosshair-controls>
    <Input type="color" aria-label="Crosshair color" class="h-full min-h-20 w-full" value={value.color.slice(0, 7)} disabled={!custom} oninput={event => value.color = event.currentTarget.value + value.color.slice(7)} />
    <div class="grid gap-4 py-1">
      <div class="grid gap-2">
        <div class="flex items-center justify-between text-xs"><span>Opacity</span><span class="tabular-nums text-muted-foreground">{colorOpacityPercent(value.color)}%</span></div>
        <Slider type="single" min={0} max={100} step={1} thumbLabel="Crosshair opacity" disabled={!custom} value={colorOpacityPercent(value.color)} onValueChange={opacity} />
      </div>
      <div class="grid gap-2">
        <div class="flex items-center justify-between text-xs"><span>Size</span><span class="tabular-nums text-muted-foreground">{value.sizePx} px</span></div>
        <Slider type="single" min={crosshairSize.min} max={crosshairSize.max} step={1} thumbLabel="Crosshair size" disabled={!custom} bind:value={value.sizePx} />
      </div>
    </div>
  </div>
</div>
