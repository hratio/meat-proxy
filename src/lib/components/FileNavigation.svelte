<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import { ArrowLeft, ArrowRight, ChevronDown, FolderTree, ArrowDownWideNarrow, ArrowUpWideNarrow, SkipForward, Check } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Popover from '$lib/components/ui/popover';
  import Hint from './Hint.svelte';
  import { Switch } from '$lib/components/ui/switch';
  import { Label } from '$lib/components/ui/label';

  import { fileSortOptions, filePriorityOptions, type FileSort, type FilePriorities } from '$lib/file-list';
  let { total, index, sort, priorities, previousKey, nextKey, unreviewedKey, hasUnreviewed, onprevious, onnext, onunreviewed, onsort, onpriorities }: {
    total: number; index: number; sort: FileSort; priorities: FilePriorities;
    previousKey: string; nextKey: string; unreviewedKey: string; hasUnreviewed: boolean;
    onprevious: () => void; onnext: () => void; onunreviewed: () => void; onsort: (sort: FileSort) => void;
    onpriorities: (priorities: FilePriorities) => Promise<void>;
  } = $props();
  const id = $props.id();
  let open = $state(false);
  let pending = $state(false);
  const icons = { default: FolderTree, easy: ArrowUpWideNarrow, hard: ArrowDownWideNarrow };
  async function prioritize(key: keyof FilePriorities, checked: boolean) {
    if (pending) return;
    pending = true;
    try { await onpriorities({ ...priorities, [key]: checked }); }
    finally { pending = false; }
  }
</script>

<div class="flex shrink-0 items-center gap-1 @max-[1150px]/toolbar:gap-0" role="group" aria-label="File navigation">
    <Hint text={`Top of file / previous file · ${previousKey.toUpperCase()}`}>
      {#snippet children({ props })}<Button {...mergeProps(props, { onclick: onprevious })} variant="ghost" size="icon" disabled={!total} aria-label="Previous file"><ArrowLeft /></Button>{/snippet}
    </Hint>
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="ghost" disabled={!total} aria-label="File position and review order" class="gap-2 px-1.5 tabular-nums">
          <span>File <strong class="font-semibold">{index < 0 ? 0 : index + 1}</strong> <span class="text-muted-foreground">of {total}</span></span><ChevronDown class="size-3.5 text-muted-foreground" />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content variant="panel" align="start" sideOffset={10} class="w-80 max-h-(--bits-popover-content-available-height) gap-3 overflow-y-auto p-3" aria-label="File navigation options">
      <div>
        <p class="mb-1.5 px-2 text-xs font-medium text-muted-foreground">Review order</p>
        <div role="group" aria-label="Review order" class="grid gap-1">
          {#each fileSortOptions as option}
            {@const Icon = icons[option.value]}
            <Button variant="ghost" class="w-full justify-start gap-2.5 aria-pressed:bg-muted aria-pressed:text-foreground" aria-pressed={sort === option.value} onclick={() => onsort(option.value)}>
              <Icon /><span class="flex-1 text-left">{option.label}</span>{#if sort === option.value}<Check class="size-3.5" />{/if}
            </Button>
          {/each}
        </div>
      </div>
      <div class="grid gap-1 border-t border-border pt-2" role="group" aria-label="Review priorities" aria-busy={pending}>
        {#each filePriorityOptions as option}
          <div class="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted">
            <Label for={`${id}-${option.value}`} class="flex-1 text-sm font-normal">{option.label}</Label>
            <Switch id={`${id}-${option.value}`} size="sm" checked={priorities[option.value]} disabled={pending} onCheckedChange={checked => void prioritize(option.value, checked)} />
          </div>
        {/each}
      </div>
      <div class="border-t border-border pt-2">
        <Button variant="ghost" class="w-full justify-start gap-2.5" disabled={!hasUnreviewed} aria-label="Next unreviewed file" aria-keyshortcuts={unreviewedKey} onclick={() => { open = false; onunreviewed(); }}><SkipForward /><span class="flex-1 text-left">Next unreviewed file</span><kbd class="text-xs text-muted-foreground">{unreviewedKey.toUpperCase()}</kbd></Button>
      </div>
    </Popover.Content>
  </Popover.Root>
  <Hint text={`Next file · ${nextKey.toUpperCase()}`}>
    {#snippet children({ props })}<Button {...mergeProps(props, { onclick: onnext })} variant="ghost" size="icon" disabled={!total} aria-label="Next file"><ArrowRight /></Button>{/snippet}
  </Hint>
</div>
