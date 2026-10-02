<script lang="ts">
  import { adlibSchema, type AdlibConfig, type AdlibClip } from '$lib/adlibs/schema';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import SingleSelect from '$lib/components/SingleSelect.svelte';

  let { value = $bindable(), volume, onvoice, usedCategories = [], usedClips = [], section = 'all' }: {
    section?: string; value: AdlibConfig; volume: number; onvoice: (clip: AdlibClip) => void;
    usedCategories?: string[]; usedClips?: string[];
  } = $props();
  const valid = $derived(adlibSchema.safeParse(value));
  const categories = $derived(value.categories.map(category => ({ value: category.id, label: category.name })));
  function nextId(prefix: string, items: { id: string }[]) {
    let n = 1;
    while (items.some(item => item.id === `${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }
  function addClip() {
    value.clips.push({ id: nextId('clip', value.clips), name: 'New voice clip', category: value.categories[0].id, url: '/audio/adlibs/voice.mp3', enabled: true, gain: 1 });
  }
</script>

<div>
  <p class="text-muted-foreground">Manage the voice library here. Choose when voices play under Game events → Trigger rules. Changes apply and save automatically.</p>
  {#if !valid.success}<p class="text-destructive text-sm" role="alert">{valid.error.issues[0].path.join('.')}: {valid.error.issues[0].message}</p>{/if}
  {#if section === 'all' || section === 'playback'}
    <div class="mt-3 grid grid-cols-2 gap-3">
      <label class="grid gap-2 text-sm">Voice gain<Input type="number" min="0" max="2" step="0.05" bind:value={value.gain} /></label>
      <label class="grid gap-2 text-sm">Quiet gap (ms)<Input type="number" min="0" max="600000" bind:value={value.gapMs} /></label>
    </div>
    <p class="mt-3 text-sm text-muted-foreground">The quiet gap spaces ordinary voice lines. Silent HUD reactions and transmissions have their own timing.</p>
  {/if}

  {#if section === 'all' || section === 'clips'}
  <section class="[&+section]:mt-5.5 [&+section]:border-t [&+section]:border-border [&+section]:pt-3" aria-label="Ad-lib clips">
    <h3 class="my-3 text-[15px] font-semibold">Voice clips</h3>
    <p class="text-muted-foreground">Put audio under static/audio/adlibs/ and use /audio/adlibs/name.ogg here. Opus, MP3 and WAV clips work. Enabled clips form each category’s random pool. To use one specific clip, select it in the game event’s Voice setting.</p>
    {#each value.clips as clip, index}
      <fieldset class="mt-4.5 mb-3 min-w-0 rounded-md border border-border p-3">
        <legend class="max-w-full px-1 text-sm wrap-anywhere">{clip.name}</legend>
        <div class="grid grid-cols-2 gap-3">
          <label class="grid gap-2 text-xs text-muted-foreground">Duration (seconds)<Input type="number" min="0.001" max="600" step=".001" bind:value={clip.durationSec} /></label>
          <label class="grid gap-2 text-xs text-muted-foreground">Transcript<Input bind:value={clip.text} maxlength={1200} /></label>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="mb-3.5 flex flex-col gap-2 text-xs tracking-wide text-muted-foreground">Clip ID<Input bind:value={clip.id} /></label>
          <label class="mb-3.5 flex flex-col gap-2 text-xs tracking-wide text-muted-foreground">Clip name<Input bind:value={clip.name} /></label>
        </div>
        <label class="mb-3.5 flex flex-col gap-2 text-xs tracking-wide text-muted-foreground mt-3">Audio URL<Input bind:value={clip.url} /></label>
        <div class="mt-3"><SingleSelect label="Clip category" bind:value={clip.category} options={categories} /></div>
        <div class="flex items-center justify-between gap-2.5 border-b border-border/50 py-3 text-sm text-muted-foreground"><Label for={`adlib-clip-${index}`}>Enabled</Label><Switch id={`adlib-clip-${index}`} bind:checked={clip.enabled} /></div>
        <label class="mb-3.5 flex flex-col gap-2 text-xs tracking-wide text-muted-foreground">Clip gain<Input type="number" min="0" max="2" step="0.05" bind:value={clip.gain} /></label>
        <div class="mt-3 mb-1 flex flex-wrap gap-2"><Button variant="outline" disabled={!valid.success || !volume} onclick={() => onvoice($state.snapshot(clip))}>Play clip</Button><Button variant="outline" disabled={usedClips.includes(clip.id)} onclick={() => value.clips.splice(index, 1)}>Remove clip</Button></div>
      </fieldset>
    {/each}
    <Button variant="outline" disabled={!value.categories.length} onclick={addClip}>Add clip</Button>
  </section>
  {/if}

  {#if section === 'all' || section === 'categories'}
  <section class="[&+section]:mt-5.5 [&+section]:border-t [&+section]:border-border [&+section]:pt-3" aria-label="Ad-lib categories">
    <h3 class="my-3 text-[15px] font-semibold">Categories</h3>
    {#each value.categories as category, index}
      <fieldset class="mt-4.5 mb-3 min-w-0 rounded-md border border-border p-3">
        <div class="grid grid-cols-2 gap-3">
          <label class="mb-3.5 flex flex-col gap-2 text-xs tracking-wide text-muted-foreground">Category ID<Input bind:value={category.id} /></label>
          <label class="mb-3.5 flex flex-col gap-2 text-xs tracking-wide text-muted-foreground">Category name<Input bind:value={category.name} /></label>
        </div>
        <div class="mt-3 mb-1 flex flex-wrap gap-2"><Button variant="outline" disabled={value.clips.some(clip => clip.category === category.id) || usedCategories.includes(category.id)} onclick={() => value.categories.splice(index, 1)}>Remove category</Button></div>
      </fieldset>
    {/each}
    <Button variant="outline" onclick={() => value.categories.push({ id: nextId('category', value.categories), name: 'New category' })}>Add category</Button>
  </section>
  {/if}
</div>
