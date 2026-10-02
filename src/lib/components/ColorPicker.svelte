<script lang="ts">
  import { untrack } from 'svelte';
  import { Check } from '@lucide/svelte';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { Slider } from '$lib/components/ui/slider';
  import { useUi } from '$lib/ui/context.svelte';
  import { colorHue, colorOpacityPercent, hueSeed, userPalette, withColorOpacity, type ColorProfile } from '$lib/ui/user-colors';

  let { id, value = $bindable(), label = 'Color', disabled = false, profile, allowOpacity = false, onchange }: {
    id?: string; value: string; label?: string; disabled?: boolean; profile?: ColorProfile; allowOpacity?: boolean;
    onchange?: (value: string) => void;
  } = $props();
  const ui = useUi();
  let open = $state(false);
  const presets = [
    ['Red', 25], ['Orange', 55], ['Amber', 80], ['Yellow', 100],
    ['Lime', 125], ['Green', 150], ['Teal', 180], ['Cyan', 220],
    ['Blue', 260], ['Purple', 295], ['Pink', 330]
  ] as const;
  let colors = $derived(profile ?? ui.colors);
  let hue = $state(untrack(() => colorHue(value)));
  let opacity = $state(untrack(() => colorOpacityPercent(value)));
  let emitted = untrack(() => value);
  $effect(() => {
    if (value !== emitted) { hue = colorHue(value); opacity = colorOpacityPercent(value); emitted = value; }
  });
  let palette = $derived(userPalette(value.slice(0, 7), colors));
  let previewColor = $derived(allowOpacity ? withColorOpacity(palette.foreground, opacity) : palette.foreground);
  let gradient = $derived(`linear-gradient(to right, ${Array.from({ length: 25 }, (_, index) => userPalette(hueSeed(index * 15), colors).foreground).join(', ')})`);
  // Keep the slider's exact position during editing; hex storage can shift a
  // hue by a fraction of a degree and must not swallow keyboard arrow steps.
  function choose(next: string, angle = colorHue(next)) {
    const result = allowOpacity ? withColorOpacity(next, opacity) : next;
    emitted = result; hue = angle; value = result; onchange?.(result);
  }
  function chooseOpacity(next: number) {
    const result = withColorOpacity(value, next);
    emitted = result; opacity = next; value = result; onchange?.(result);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button {...props} {id} variant="outline" class="w-full min-w-16 px-3" {disabled} aria-label={label}>
        <span class="relative h-5 w-full overflow-hidden rounded-sm border border-foreground/15" style:background={allowOpacity ? 'repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 0 0 / 10px 10px' : palette.foreground}><span class="absolute inset-0" style:background={previewColor}></span></span>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-64 gap-4 p-4" aria-label={`Choose ${label.toLowerCase()}`}>
    <div class="flex items-center justify-between gap-3">
      <span class="text-sm font-medium">Choose a color</span>
      <span class="rounded border px-2 py-0.5 text-xs font-medium" style:color={previewColor} style:background={palette.background} style:border-color={previewColor}>Aa</span>
    </div>
    <div class="grid grid-cols-6 gap-2" role="group" aria-label="Colors">
      {#each [...presets, ['Neutral', undefined] as const] as [name, angle]}
        {@const seed = angle === undefined ? '#808080' : hueSeed(angle)}
        {@const swatch = userPalette(seed, colors)}
        {@const selected = angle === undefined ? hue === undefined : hue !== undefined && Math.abs(((hue - angle + 540) % 360) - 180) < 2}
        <Button variant="ghost" size="icon-sm" class="size-7 rounded-full border border-foreground/15 p-0" aria-label={name} aria-pressed={selected}
          style={`background: ${swatch.foreground}; color: ${swatch.onSolid}`} onclick={() => choose(seed, angle)}>
          {#if selected}<Check class="size-4" />{/if}
        </Button>
      {/each}
    </div>
    <Slider type="single" min={0} max={359} step={1} value={Math.round(hue ?? 0) % 360} thumbLabel={`${label} hue`}
      onValueChange={next => choose(hueSeed(next), next)}
      style={`--hue-gradient: ${gradient}; --chosen-color: ${palette.foreground}`}
      class="h-6 [&_[data-slot=slider-track]]:h-3 [&_[data-slot=slider-track]]:bg-[image:var(--hue-gradient)] [&_[data-slot=slider-range]]:hidden [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-(--chosen-color) [&_[data-slot=slider-thumb]]:shadow-sm" />
    {#if allowOpacity}
      <div class="grid gap-1.5">
        <div class="flex justify-between text-xs text-muted-foreground"><span>Opacity</span><span class="tabular-nums">{opacity}%</span></div>
        <Slider type="single" min={0} max={100} step={1} value={opacity} thumbLabel={`${label} opacity`}
          onValueChange={chooseOpacity}
          style={`--opacity-gradient: linear-gradient(to right, transparent, ${palette.foreground}), repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%); --chosen-color: ${previewColor}`}
          class="h-6 [&_[data-slot=slider-track]]:h-3 [&_[data-slot=slider-track]]:bg-[image:var(--opacity-gradient)] [&_[data-slot=slider-track]]:bg-size-[100%_100%,10px_10px] [&_[data-slot=slider-range]]:hidden [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-(--chosen-color) [&_[data-slot=slider-thumb]]:shadow-sm" />
      </div>
    {/if}
  </Popover.Content>
</Popover.Root>
