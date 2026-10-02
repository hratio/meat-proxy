<script lang="ts">
  import HudTintControl from './HudTintControl.svelte';
  import { Label } from '$lib/components/ui/label';
  import * as Select from '$lib/components/ui/select';
  import { Slider } from '$lib/components/ui/slider';
  import { Switch } from '$lib/components/ui/switch';
  import { hudSchema, type HudSettings } from '$lib/hud-config';
  import NavigatorSettings from './NavigatorSettings.svelte';
  let { value, onchange, section = 'all' }: { section?: string; value: HudSettings; onchange: (value: HudSettings) => void } = $props();
  const id = $props.id();
  const iconOptions = [
    { value: 'catalog', label: 'Catalog totems' },
    { value: 'skull', label: 'SVG skull' },
    { value: 'shield', label: 'SVG shield' },
    { value: 'target', label: 'SVG target' }
  ] as const;
  type NumericKey = { [K in keyof HudSettings]: HudSettings[K] extends number ? K : never }[keyof HudSettings];
  const groups: { id: string; title: string; fields: [NumericKey, string, number][] }[] = [
    { id: 'assembly', title: 'Assembly', fields: [['width', 'Total width', 1], ['bottom', 'Bottom offset', 1], ['leftWeight', 'Left panel width', .05], ['rightWeight', 'Right panel width', .05], ['centerWidth', 'Center width', 1], ['gap', 'Panel spacing', 1]] },
    { id: 'lettering', title: 'Code & lettering', fields: [['codeHeight', 'Code area height', 1], ['codeSize', 'Example font size', .5], ['groupSize', 'Group font size', 1], ['vcodeSize', 'V-code font size', 1], ['titleSize', 'Title font size', 1], ['iconSize', 'Icon size', 1]] },
    { id: 'portrait', title: 'Portrait', fields: [['portraitHeight', 'Portrait height', 1]] },
    { id: 'timing', title: 'Timing & motion', fields: [['weaponDelayMs', 'HUD weapon delay (ms)', 10], ['codePeekMs', 'Code reveal duration (ms)', 100], ['springStiffness', 'Mode spring stiffness', .01], ['springDamping', 'Mode spring damping', .01], ['holsteredPeek', 'Holstered group height', 1]] }
  ];
  function update<K extends keyof HudSettings>(key: K, next: HudSettings[K]) { onchange({ ...value, [key]: next }); }
</script>

<div class="hud-controls">
  {#if section === 'all' || section === 'lettering'}
  <div class="toggle-row">
    <Label for={`${id}-always-show-code`} class="text-inherit">Always show code examples</Label>
    <Switch id={`${id}-always-show-code`} checked={value.alwaysShowCode} onCheckedChange={next => update('alwaysShowCode', next)} />
  </div>
  <p class="my-3 text-[12px] text-muted-foreground">Keep examples open between rule changes.</p>
  {/if}
  {#if section === 'all' || section === 'navigator'}<NavigatorSettings {value} {onchange} />{/if}
  {#each groups.filter(group => section === 'all' || group.id === section) as group}
    <h3 class="mt-6 mb-3 font-sans text-[15px] font-[650]">{group.title}</h3>
    {#each group.fields as [key, label, step]}
      {@const field = hudSchema.shape[key].removeDefault()}
      <div class="my-3 block font-sans text-[13px]">
        <span class="flex justify-between gap-2">{label}<output class="text-muted-foreground tabular-nums">{value[key].toFixed(step < 1 ? 2 : 0)}</output></span>
        <Slider type="single" thumbLabel={label} min={field.minValue ?? 0} max={field.maxValue ?? 100} {step} value={value[key]} onValueChange={next => update(key, next)} class="mt-[6px] h-5" />
      </div>
    {/each}
  {/each}
  {#if section === 'all' || section === 'surface'}
  <h3 class="mt-6 mb-3 font-sans text-[15px] font-[650]">Surface & icons</h3>
  <div class="field-label">
    <Label for={`${id}-icon-style`} class="text-inherit">Weapon icons</Label>
    <Select.Root type="single" value={value.iconStyle} onValueChange={next => update('iconStyle', next as HudSettings['iconStyle'])}>
      <Select.Trigger id={`${id}-icon-style`} class="w-full">{iconOptions.find(option => option.value === value.iconStyle)?.label}</Select.Trigger>
      <Select.Content>
        {#each iconOptions as option}
          <Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
  <div class="mt-5"><HudTintControl value={value.tintStrength} onchange={next => update('tintStrength', next)} /></div>
  {/if}
</div>
