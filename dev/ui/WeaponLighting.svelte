<script lang="ts">
  import { untrack } from 'svelte';
  import { Download, RotateCcw } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Slider } from '$lib/components/ui/slider';
  import SingleSelect from '$lib/components/SingleSelect.svelte';
  import { modelOptions } from '$lib/weapons/catalog';
  import type { Config } from '$lib/config';
  import type { WeaponLight, WeaponLighting, WeaponLightingSettings } from '$lib/weapons/lighting-config';
  import { weaponLightingPresets } from './weapon-lighting-presets';
  import WeaponLightingPreview from './WeaponLightingPreview.svelte';

  let { weapons, onchange }: { weapons: Config['weapons']; onchange: (settings: WeaponLightingSettings) => void } = $props();
  let source = $state<'key' | 'rim' | 'fill' | 'ambient'>('key');
  let previewModel = $state(untrack(() => weapons.mainModel));
  const lighting = $derived(weapons.lighting);
  const options = $derived(modelOptions([weapons.mainModel, weapons.secondaryModel], weapons.availableModels));
  const activePreset = $derived(weaponLightingPresets.find(preset => preset.settings.exposure === weapons.exposure && JSON.stringify(preset.settings.lighting) === JSON.stringify(lighting))?.name);
  const descriptions = {
    key: 'Main light reveals the shape and surface detail.',
    rim: 'Edge light outlines the weapon from behind.',
    fill: 'Fill light brings detail back into the shadows.',
    ambient: 'Atmosphere wraps the weapon in soft light from above and below.'
  };
  function patch(next: Partial<WeaponLighting>) { onchange({ exposure: weapons.exposure, lighting: { ...$state.snapshot(lighting), ...next } }); }
  function light(next: Partial<WeaponLight>) {
    if (source !== 'ambient') patch({ [source]: { ...lighting[source], ...next } });
  }
  function download() {
    const artifact = { game: { weapons: { exposure: weapons.exposure, lighting: $state.snapshot(lighting) } } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(artifact, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'weapon-lighting.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

{#snippet dial(label: string, value: number, min: number, max: number, step: number, change: (value: number) => void, degrees = false)}
  <div class="grid min-w-0 gap-2">
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs">{label}{degrees ? ' (°)' : ''}</span>
      <Input class="h-7 w-18 text-right font-mono text-xs" type="number" aria-label={label} {min} {max} {step} {value}
        onchange={event => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) change(Math.min(max, Math.max(min, next))); else event.currentTarget.value = String(value); }} />
    </div>
    <!-- Ignore the slider's initial step rounding; only user input should edit a saved value. -->
    <Slider class="h-4" type="single" thumbLabel={label} {value} {min} {max} {step}
      onValueChange={next => { if (Math.abs(next - value) > step / 2 + Number.EPSILON) change(next); }}
      onValueCommit={next => { if (next !== value) change(next); }} />
  </div>
{/snippet}

{#snippet color(label: string, value: string, change: (value: string) => void)}
  <label class="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background/30 px-2.5 py-2">
    <Input type="color" class="h-8 w-10 shrink-0 cursor-pointer p-1" aria-label={label} {value} oninput={event => change(event.currentTarget.value)} />
    <span class="min-w-0 text-xs">{label}<span class="mt-0.5 block font-mono text-[10px] text-muted-foreground">{value.toUpperCase()}</span></span>
  </label>
{/snippet}

<div class="lighting-editor grid gap-4">
  <div class="min-[1000px]:grid-cols-4 grid grid-cols-2 gap-2">
    {#each weaponLightingPresets as preset}
      <Button variant="outline" class="h-10 justify-start gap-2 px-2.5 text-left" title={preset.description} aria-label={preset.name} selected={activePreset === preset.name} aria-pressed={activePreset === preset.name} onclick={() => onchange(structuredClone(preset.settings))}>
        <span class="flex shrink-0 -space-x-1" aria-hidden="true">{#each [preset.settings.lighting.key.color, preset.settings.lighting.fill.color, preset.settings.lighting.rim.color] as tone}<span class="size-3 rounded-full border border-black/40" style:background-color={tone}></span>{/each}</span>
        <span class="text-xs font-medium">{preset.name}</span>
      </Button>
    {/each}
  </div>

  <div class="sticky -top-6 z-1 bg-background py-2 [@media(max-height:740px)]:static">
    <WeaponLightingPreview url={previewModel} {lighting} exposure={weapons.exposure} />
  </div>

  <div class="grid grid-cols-2 gap-4">
    {@render dial('Overall brightness', weapons.exposure, .1, 3, .01, exposure => onchange({ exposure, lighting: $state.snapshot(lighting) }))}
    {@render dial('Metal reflections', lighting.environmentIntensity, 0, 2, .01, environmentIntensity => patch({ environmentIntensity }))}
  </div>
  <p class="-mt-2 text-xs leading-relaxed text-muted-foreground">Start with brightness. Lower metal reflections if polished surfaces still feel too bright.</p>

  <section class="grid gap-4 rounded-lg border border-border bg-card/30 p-4" aria-label="Light sources">
    <div class="grid grid-cols-2 gap-1 rounded-md bg-background/50 p-1 sm:grid-cols-4">
      {#each [['key', 'Main'], ['rim', 'Edge'], ['fill', 'Fill'], ['ambient', 'Atmosphere']] as [id, label]}
        <Button variant="ghost" class="px-2 text-xs" aria-label={`${label} light`} selected={source === id} aria-pressed={source === id} onclick={() => source = id as typeof source}>{label}</Button>
      {/each}
    </div>
    <p class="text-xs leading-relaxed text-muted-foreground">{descriptions[source]}</p>
    {#if source === 'ambient'}
      {@render dial('Atmosphere strength', lighting.ambient.intensity, 0, 5, .01, intensity => patch({ ambient: { ...lighting.ambient, intensity } }))}
      <div class="grid grid-cols-2 gap-2">
        {@render color('Sky color', lighting.ambient.skyColor, skyColor => patch({ ambient: { ...lighting.ambient, skyColor } }))}
        {@render color('Ground color', lighting.ambient.groundColor, groundColor => patch({ ambient: { ...lighting.ambient, groundColor } }))}
      </div>
    {:else}
      {@const selected = lighting[source]}
      <div class="grid grid-cols-2 items-end gap-4">
        {@render dial('Light strength', selected.intensity, 0, 5, .01, intensity => light({ intensity }))}
        {@render color('Light color', selected.color, color => light({ color }))}
      </div>
      <div class="grid grid-cols-2 gap-4">
        {@render dial('Direction', selected.azimuth, -180, 180, 1, azimuth => light({ azimuth }), true)}
        {@render dial('Height', selected.elevation, -90, 90, 1, elevation => light({ elevation }), true)}
      </div>
      <p class="text-[11px] text-muted-foreground">Direction: 0° in front · −90° left · 90° right · ±180° behind.</p>
    {/if}
  </section>

  {@render dial('Reflection rotation', lighting.environmentRotation, -180, 180, 1, environmentRotation => patch({ environmentRotation }), true)}
  <SingleSelect label="Preview weapon" value={previewModel} {options} onchange={value => previewModel = value} />
  <p class="-mt-2 text-xs leading-relaxed text-muted-foreground">Inspect any model here. Changes apply live to both held weapons and gloves in the arena.</p>
  <div class="flex flex-wrap items-center gap-2">
    <Button variant="outline" onclick={download}><Download class="size-4" />Export lighting</Button>
    <Button variant="ghost" onclick={() => onchange(structuredClone(weaponLightingPresets[0].settings))}><RotateCcw class="size-4" />Reset lighting</Button>
  </div>
  <p class="-mt-2 text-xs leading-relaxed text-muted-foreground">Changes save automatically to config/studio.json. Export lighting downloads a copy of this setup.</p>
</div>
