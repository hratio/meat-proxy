<script lang="ts">
  import { PanelsTopLeft, ChevronDown, File, Files, AlignLeft, Columns2, FoldHorizontal, UnfoldHorizontal, Check } from '@lucide/svelte';
  import type { Config } from '$lib/config';
  import { Button } from '$lib/components/ui/button';
  import * as Popover from '$lib/components/ui/popover';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import { tick } from 'svelte';

  let { display, onchange }: { display: Config['display']; onchange: (display: Partial<Config['display']>) => Promise<void> } = $props();
  let pending = $state(false);
  let selections = $state<Record<string, string>>({});
  $effect(() => { selections = { fileView: display.fileView, diffStyle: display.diffStyle, wideMode: String(display.wideMode) }; });
  async function change(key: 'fileView' | 'diffStyle' | 'wideMode', value: string) {
    if (!value) { await tick(); selections[key] = String(display[key]); return; }
    if (pending) return;
    pending = true;
    try { await onchange({ [key]: key === 'wideMode' ? value === 'true' : value }); }
    finally { selections[key] = String(display[key]); pending = false; }
  }
  const rows = [
    { label: 'Files', key: 'fileView', options: [{ value: 'single', label: 'One at a time', icon: File }, { value: 'all', label: 'All files', icon: Files }] },
    { label: 'Diff layout', key: 'diffStyle', options: [{ value: 'unified', label: 'Unified', icon: AlignLeft }, { value: 'split', label: 'Side by side', icon: Columns2 }] },
    { label: 'Code width', key: 'wideMode', options: [{ value: false, label: 'Comfortable', icon: FoldHorizontal }, { value: true, label: 'Expanded', icon: UnfoldHorizontal }] }
  ] as const;
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}<Button {...props} variant="ghost" aria-label="View options"><PanelsTopLeft />View<ChevronDown class="size-3.5 text-muted-foreground" /></Button>{/snippet}
  </Popover.Trigger>
  <Popover.Content variant="panel" align="start" sideOffset={10} class="w-[min(340px,calc(100vw-24px))] gap-4 p-4" aria-label="View options" aria-busy={pending}>
    {#each rows as row}
      <fieldset class="min-w-0" disabled={pending}>
        <legend class="mb-2 text-xs font-medium text-muted-foreground">{row.label}</legend>
        <ToggleGroup.Root type="single" variant="outline" class="w-full bg-background/40" aria-label={row.label} bind:value={selections[row.key]} onValueChange={value => void change(row.key, value)}>
          {#each row.options as option}
            {@const selected = display[row.key] === option.value}
            <ToggleGroup.Item value={String(option.value)} disabled={pending} class="relative h-auto min-h-17 min-w-0 flex-1 flex-col gap-2 px-2 py-3 text-xs text-muted-foreground data-[state=on]:text-foreground">
              <option.icon class="size-5" /><span>{option.label}</span>{#if selected}<Check class="absolute top-1.5 right-1.5 size-3" />{/if}
            </ToggleGroup.Item>
          {/each}
        </ToggleGroup.Root>
      </fieldset>
    {/each}
  </Popover.Content>
</Popover.Root>
