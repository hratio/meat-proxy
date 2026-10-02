<script lang="ts">
  import { ListFilter, RotateCcw, Settings } from '@lucide/svelte';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Label } from '$lib/components/ui/label';
  import { Separator } from '$lib/components/ui/separator';
  import * as InputGroup from '$lib/components/ui/input-group';
  import Hint from './Hint.svelte';
  import { fileExtension, type FileFilters } from '$lib/file-list';
  import { mergeProps } from 'bits-ui';
  import type { DiffFile } from '$lib/types';
  import type { FileFilterPreset } from '$lib/file-filter-presets';
  import FilterPresets from './filters/FilterPresets.svelte';

  let { files, value, presets, presetError, onchange, onpresetschange }: {
    files: DiffFile[]; value: FileFilters; presets: FileFilterPreset[]; presetError?: string;
    onchange: (value: FileFilters) => void; onpresetschange: (presets: FileFilterPreset[]) => Promise<void>;
  } = $props();
  const id = $props.id();
  let open = $state(false), editing = $state(false);
  let triggerElement = $state<HTMLButtonElement | null>(null);
  let extensions = $derived([...new Set(files.map(file => fileExtension(file.path)))].sort());
  let active = $derived(!!value.excludedExtensions.length || !value.showDeleted || !value.showCompleted || presets.some(preset => value.presetIds?.includes(preset.id)));

  const toggle = (extension: string, checked: boolean) => {
    onchange({ ...value, excludedExtensions: checked ? value.excludedExtensions.filter(item => item !== extension) : [...value.excludedExtensions, extension] });
  };
  const togglePreset = (id: string, checked: boolean) => {
    const selected = value.presetIds || [];
    onchange({ ...value, presetIds: checked ? [...selected, id] : selected.filter(item => item !== id) });
  };
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props: trigger })}
      <Hint text="Filter files">
        {#snippet children({ props: hint })}
          <InputGroup.Button {...mergeProps(trigger, hint)} bind:ref={triggerElement} variant="ghost" size="icon-xs" aria-label="Filter files" class={active ? 'text-primary' : ''}><ListFilter /></InputGroup.Button>
        {/snippet}
      </Hint>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content variant="panel" align="end" class="w-64 max-h-(--bits-popover-content-available-height) gap-3 overflow-hidden p-4" aria-label="File filters" onCloseAutoFocus={event => { if (editing) event.preventDefault(); }}>
    <p class="shrink-0 font-semibold">Visible files</p>
    <div class="flex shrink-0 items-center gap-2"><Checkbox id={id + '-completed'} checked={value.showCompleted} onCheckedChange={checked => onchange({ ...value, showCompleted: checked })} /><Label for={id + '-completed'}>Show completed files</Label></div>
    <div class="flex shrink-0 items-center gap-2"><Checkbox id={id + '-deleted'} checked={value.showDeleted} onCheckedChange={checked => onchange({ ...value, showDeleted: checked })} /><Label for={id + '-deleted'}>Deleted files</Label></div>
    <Separator class="shrink-0" />
    <div class="flex shrink-0 items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">Presets</p>
      <div class="flex items-center gap-1">
        {#if value.presetIds?.length}<Button variant="ghost" size="xs" aria-label="Clear selected presets" onclick={() => onchange({ ...value, presetIds: [] })}><RotateCcw />Clear</Button>{/if}
        <Hint text="Manage filter presets">{#snippet children({ props })}<Button {...mergeProps(props, { onclick: () => { open = false; editing = true; } })} variant="ghost" size="icon-xs" aria-label="Manage filter presets"><Settings /></Button>{/snippet}</Hint>
      </div>
    </div>
    <div class="flex min-h-0 max-h-36 flex-col gap-3 overflow-y-auto overscroll-contain p-1" role="group" aria-label="Filter presets">
      {#each presets as preset, index (preset.id)}
        <div class="flex shrink-0 items-center gap-2">
          <Checkbox class="after:inset-0" id={id + '-preset-' + index} checked={value.presetIds?.includes(preset.id) || false} onCheckedChange={checked => togglePreset(preset.id, checked)} />
          <Label for={id + '-preset-' + index} class="min-w-0 flex-1 break-words">{preset.name}</Label>
        </div>
      {:else}<p class="text-xs text-muted-foreground">Create a preset with the settings icon.</p>{/each}
    </div>
    {#if presets.length}<p class="shrink-0 text-xs text-muted-foreground">Select presets to show files matching any of them.</p>{/if}
    {#if presetError}<p role="alert" class="shrink-0 text-xs text-destructive">{presetError}</p>{/if}
    <Separator class="shrink-0" />
    <div class="flex shrink-0 items-center justify-between"><p class="text-xs text-muted-foreground">File types</p><Button variant="ghost" size="xs" onclick={() => onchange({ ...value, excludedExtensions: [] })}><RotateCcw />All</Button></div>
    <div class="flex min-h-0 max-h-64 flex-col gap-3 overflow-y-auto overscroll-contain p-1">
      {#each extensions as extension, index (extension)}
        <div class="flex shrink-0 items-center gap-2">
          <Checkbox class="after:inset-0" id={id + '-ext-' + index} checked={!value.excludedExtensions.includes(extension)} onCheckedChange={checked => toggle(extension, checked)} />
          <Label for={id + '-ext-' + index} class="flex-1">{extension}</Label>
          <span class="text-xs text-muted-foreground">{files.filter(file => fileExtension(file.path) === extension).length}</span>
        </div>
      {/each}
    </div>
  </Popover.Content>
</Popover.Root>

{#if editing}<FilterPresets {presets} onchange={onpresetschange} onclose={() => editing = false} returnFocus={triggerElement} />{/if}
