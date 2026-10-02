<script lang="ts">
  import { hudSchema, type HudSettings } from '$lib/hud-config';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import { Slider } from '$lib/components/ui/slider';

  let { value, onchange }: { value: HudSettings; onchange: (value: HudSettings) => void } = $props();
  const id = $props.id();
  const fields = [
    ['navigatorNeighbors', 'Codes in each direction', 1],
    ['navigatorWidthPx', 'Panel width', 10],
    ['navigatorMinWidthPx', 'Minimum side width', 10],
    ['navigatorRowHeightPx', 'Row height', 1],
    ['navigatorGapPx', 'Distance from weapon panel', 1],
    ['navigatorMotionMs', 'Slide duration (ms)', 10],
    ['navigatorFarOpacity', 'Distant code opacity', .05]
  ] as const;
</script>

<section class="my-6 grid gap-5" aria-label="V-code navigator settings">
  <div class="flex items-center justify-between gap-4">
    <Label for={id} class="text-base font-semibold">V-code navigator</Label>
    <Switch {id} checked={value.navigatorEnabled} onCheckedChange={enabled => onchange({ ...value, navigatorEnabled: enabled })} />
  </div>
  {#if value.navigatorEnabled}
    <div class="flex items-center justify-between gap-4">
      <Label for={`${id}-always-visible`}>Always show navigator</Label>
      <Switch id={`${id}-always-visible`} checked={value.navigatorAlwaysVisible} onCheckedChange={visible => onchange({ ...value, navigatorAlwaysVisible: visible })} />
    </div>
    {#each fields as [key, label, step]}
      {@const field = hudSchema.shape[key].removeDefault()}
      <div class="grid gap-2">
        <div class="flex justify-between gap-3 text-sm"><span>{label}</span><output class="text-muted-foreground">{value[key].toFixed(step < 1 ? 2 : 0)}</output></div>
        <Slider type="single" thumbLabel={label} min={field.minValue!} max={field.maxValue!} {step} value={value[key]} onValueChange={next => onchange({ ...value, [key]: next })} />
      </div>
    {/each}
  {/if}
</section>
