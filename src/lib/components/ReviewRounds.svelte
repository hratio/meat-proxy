<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import { ArrowLeft, ArrowRight, Check, Layers3, LoaderCircle } from '@lucide/svelte';
  import type { FileComparison, FileHistoryEntry } from '$lib/types';
  import { revisionWindow } from '$lib/revision-window';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import Hint from './Hint.svelte';
  import TimeAgo from './TimeAgo.svelte';

  let { path, entries, current, overall, snapshot, busy, loading, boxSize, newer, reminder = 0, reducedMotion = false, onselect, onprevious, onnext, onoverall }: {
    path: string; entries: FileHistoryEntry[]; current: number; overall: boolean;
    snapshot?: FileComparison;
    busy: boolean; loading: boolean; boxSize: number; newer: boolean;
    reminder?: number; reducedMotion?: boolean;
    onselect: (entry: FileHistoryEntry) => void; onprevious: () => void; onnext: () => void; onoverall: () => void;
  } = $props();
  let controlsWidth = $state(0);
  // Measure the available slot, not the content-sized track, so elision stays
  // stable as rounds change. Reserve the 24px next button and its 4px gap.
  let width = $derived(Math.max(0, controlsWidth - 28));
  const roundClass = 'w-max min-w-(--revision-box-size) flex-none';
  let measurements: HTMLDivElement;
  let buttonWidths = $state<number[]>([]);
  let visible = $derived(buttonWidths.length === entries.length
    ? revisionWindow(buttonWidths, current, width)
    : entries.length ? [entries.length - 1] : []);

  // Measure every round at its natural size, including checks and the Live dot.
  // The ruler is outside the layout, so pagination never changes its own budget.
  $effect(() => {
    entries; newer; reminder; boxSize;
    const buttons = [...measurements.children];
    const measure = () => buttonWidths = buttons.map(button => button.getBoundingClientRect().width);
    const observer = new ResizeObserver(measure);
    for (const button of buttons) observer.observe(button);
    measure();
    return () => observer.disconnect();
  });
  const label = (entry: FileHistoryEntry) => `${entry.baseLabel} → ${entry.headLabel}`;
</script>

{#snippet roundContent(entry: FileHistoryEntry, measuring = false)}
  {#if entry.completedAt}<Check class="size-3" />{/if}
  <span class="round-label">{entry.current || !entry.completedAt ? 'Current' : `R${entry.number}`}</span>
  {#if entry.current && (newer || reminder)}
    {#key reminder}
      <span class={['relative size-[5px] shrink-0 rounded-full bg-primary', !measuring && reminder && !reducedMotion && 'animate-pulse [animation-duration:450ms] [animation-iteration-count:3] motion-reduce:animate-none']} data-live-indicator={measuring ? undefined : ''} data-reminder={measuring ? undefined : reminder} aria-hidden="true">
        {#if !measuring && reminder && !reducedMotion}<span class="absolute inset-0 animate-ping rounded-full bg-primary [animation-duration:450ms] [animation-iteration-count:3] [animation-fill-mode:forwards] motion-reduce:hidden"></span>{/if}
      </span>
    {/key}
    {#if !measuring}<span class="sr-only">{reminder ? 'Select Current round to add findings' : 'Newer changes available'}</span>{/if}
  {/if}
{/snippet}

<div class="file-revision-controls @container/revision-controls relative z-16 border border-t-0 border-border bg-card text-[12px] text-muted-foreground" style:--revision-box-size={`${boxSize}px`} aria-label={`Review rounds for ${path}`} aria-busy={busy || loading}>
  <div class="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden" aria-hidden="true" inert>
    <div class="flex w-max gap-1" bind:this={measurements}>
      {#each entries as entry (entry.id)}
        <span class={buttonVariants({ variant: 'outline', size: 'sm', class: roundClass })}>{@render roundContent(entry, true)}</span>
      {/each}
    </div>
  </div>
  <div class="round-controls flex min-w-0 items-center gap-1 px-2.5 py-1">
    <Hint text="Previous review round" disabled={busy || loading || current <= 0}>
      {#snippet children({ props })}<Button {...mergeProps(props, { onclick: onprevious })} variant="ghost" size="icon-xs" disabledStyle="static" disabled={busy || loading || current <= 0} aria-label="Previous review round"><ArrowLeft size={15} /></Button>{/snippet}
    </Hint>
    <div class="flex min-w-0 flex-1 items-center gap-1" bind:clientWidth={controlsWidth}>
      <div class="rounds-track flex min-w-0 items-center gap-1 overflow-hidden py-1" role="group" aria-label="Review rounds">
        {#each visible as index, position (index === null ? `gap-${position}` : entries[index].id)}
          {#if index === null}
            <span class="round-gap w-4.5 flex-[0_0_18px] text-center" aria-hidden="true">…</span>
          {:else}
            {@const entry = entries[index]}
            <Hint>
              {#snippet content()}<div class="grid gap-1"><strong class="font-medium">{label(entry)}</strong><span class="text-muted-foreground">{#if entry.completedAt}Completed: <TimeAgo value={entry.completedAt} />{:else}Not completed{/if}</span></div>{/snippet}
              {#snippet children({ props })}
                <Button {...mergeProps(props, { onclick: () => onselect(entry) })} variant="outline" size="sm" disabledStyle="static" class={`round-button ${roundClass}`}
                  disabled={busy} selected={!overall && index === current} aria-pressed={!overall && index === current} aria-label={`View ${label(entry)}${entry.completedAt ? ' · Completed' : ''}`}>
                  {@render roundContent(entry)}
                </Button>
              {/snippet}
            </Hint>
          {/if}
        {/each}
      </div>
      <Hint text="Next review round" disabled={busy || loading || current < 0 || current >= entries.length - 1}>
        {#snippet children({ props })}<Button {...mergeProps(props, { onclick: onnext })} variant="ghost" size="icon-xs" disabledStyle="static" disabled={busy || loading || current < 0 || current >= entries.length - 1} aria-label="Next review round"><ArrowRight size={15} /></Button>{/snippet}
      </Hint>
    </div>
    {#if snapshot}
      <Hint>
        {#snippet content()}<div class="grid gap-1"><strong class="font-medium">{snapshot.baseLabel} → {snapshot.headLabel}</strong><span class="text-muted-foreground">Saved context for this finding. Select Current round to continue reviewing.</span></div>{/snippet}
        {#snippet children({ props })}<Button {...props} variant="outline" size="sm" class="snapshot-button shrink-0" selected aria-pressed="true" aria-label="Viewing finding snapshot">Snapshot</Button>{/snippet}
      </Hint>
    {/if}
    {#if busy || loading}<LoaderCircle size={13} class="shrink-0 animate-spin motion-reduce:animate-none" />{/if}
    <Hint text="Compare Git HEAD with the current file">
      {#snippet children({ props })}<Button {...mergeProps(props, { onclick: onoverall })} variant="outline" size="sm" disabledStyle="static" disabled={busy} class="overall-button ml-1 shrink-0" aria-label="Since HEAD" selected={overall} aria-pressed={overall}><Layers3 size={13} class="overall-icon hidden @max-[400px]/revision-controls:block" /><span class="overall-label @max-[400px]/revision-controls:hidden">Since HEAD</span></Button>{/snippet}
    </Hint>
  </div>
</div>
