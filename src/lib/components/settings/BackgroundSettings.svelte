<script lang="ts">
  import type { BackgroundConfig } from '$lib/backgrounds/config';
  import { defaultBackground } from '$lib/backgrounds/config';
  import { backgrounds, backgroundSizing } from '$lib/backgrounds';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Slider } from '$lib/components/ui/slider';
  import SingleSelect from '../SingleSelect.svelte';

  let { value = $bindable() }: { value: BackgroundConfig } = $props();
  const id = $props.id();
  const imageOptions = $derived(backgrounds.some(image => image.value === value.image) ? backgrounds : [
    ...backgrounds, { value: value.image, label: 'Unavailable image', disabled: true }
  ]);
  function chooseColor(color: string) {
    if (/^#[0-9a-f]{6}$/i.test(color)) value.color = color;
  }
</script>

<div class="grid gap-5" data-background-settings>
  {#if value.mode !== 'scene'}
    <div class="arena-background relative isolate h-28 overflow-hidden rounded-lg border border-border" role="img" aria-label="Background preview"></div>
  {/if}
  <SingleSelect label="Background" value={value.mode} options={[
    { value: 'none', label: 'No background' },
    { value: 'image', label: 'Image' },
    { value: 'color', label: 'Solid color' },
    { value: 'scene', label: '3D city' }
  ]} onchange={mode => value.mode = mode as BackgroundConfig['mode']} />
  {#if value.mode === 'image'}
    <SingleSelect label="Background image" bind:value={value.image} options={imageOptions} />
    {#if !backgrounds.some(image => image.value === value.image)}
      <p class="text-xs text-muted-foreground">This image is no longer available. Choose another image or use the theme background.</p>
    {/if}
    <div class="grid gap-2">
      <SingleSelect label="Image sizing" value={value.sizing} options={backgroundSizing} onchange={sizing => value.sizing = sizing as BackgroundConfig['sizing']} />
      <p class="text-xs text-muted-foreground">{backgroundSizing.find(option => option.value === value.sizing)?.description}</p>
    </div>
    <div class="grid gap-3">
      <div class="flex items-center justify-between text-sm"><span>Image opacity</span><span class="tabular-nums text-muted-foreground">{Math.round(value.opacity * 1000) / 10}%</span></div>
      <Slider type="single" min={0} max={100} step={0.1} thumbLabel="Background image opacity" value={value.opacity * 100} onValueChange={percent => value.opacity = Math.round(percent * 10) / 1000} />
    </div>
  {:else if value.mode === 'scene'}
    <p class="text-xs text-muted-foreground">A fixed view of the waterfront, with moving water, lightning, and shimmering lights. Reduced motion keeps the scene still.</p>
    <div class="grid gap-3">
      <div class="flex items-center justify-between text-sm"><span>Scene opacity</span><span class="tabular-nums text-muted-foreground">{Math.round(value.sceneOpacity * 100)}%</span></div>
      <Slider type="single" min={0} max={100} step={1} thumbLabel="Scene opacity" value={value.sceneOpacity * 100} onValueChange={percent => value.sceneOpacity = percent / 100} />
    </div>
    <div class="grid gap-3">
      <div class="flex items-center justify-between text-sm"><span>Scene blur</span><span class="tabular-nums text-muted-foreground">{value.sceneBlur}px</span></div>
      <Slider type="single" min={0} max={20} step={.5} thumbLabel="Scene blur" value={value.sceneBlur} onValueChange={blur => value.sceneBlur = blur} />
    </div>
    <div class="grid gap-3">
      <div class="flex items-center justify-between text-sm"><span>Shade behind review</span><span class="tabular-nums text-muted-foreground">{Math.round(value.sceneFocus * 100)}%</span></div>
      <Slider type="single" min={0} max={100} step={1} thumbLabel="Shade behind review" value={value.sceneFocus * 100} onValueChange={percent => value.sceneFocus = percent / 100} />
    </div>
  {:else if value.mode === 'color'}
    <div class="grid grid-cols-[1fr_44px_100px] items-center gap-2">
      <Label for={`${id}-color`}>Background color</Label>
      <Input id={`${id}-color`} type="color" value={value.color} oninput={event => chooseColor(event.currentTarget.value)} />
      <Input aria-label="Background color hex" class="font-mono" maxlength={7} pattern="#[0-9a-fA-F]{6}" value={value.color}
        oninput={event => chooseColor(event.currentTarget.value)} onblur={event => event.currentTarget.value = value.color} />
    </div>
  {/if}
  <Button variant="outline" class="justify-self-start" onclick={() => value = { ...defaultBackground }}>Reset background</Button>
</div>
