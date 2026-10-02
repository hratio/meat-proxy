<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import { ChevronDown, History, Radio, GitCompareArrows, LockKeyhole, LoaderCircle, Check } from '@lucide/svelte';
  import type { FileViewSelection } from '$lib/file-section-state';
  import { Button } from '$lib/components/ui/button';
  import * as Popover from '$lib/components/ui/popover';
  import Hint from './Hint.svelte';

  let { path, kind, round, historyCount, newer = false, reminder = 0, reducedMotion = false, expanded = $bindable(false), busy, onselect }: {
    path: string; kind: FileViewSelection['kind']; round?: number; historyCount: number; expanded?: boolean; busy: boolean;
    newer?: boolean; reminder?: number; reducedMotion?: boolean;
    onselect: (kind: 'latest' | 'head') => void;
  } = $props();
  let open = $state(false);
  let label = $derived(kind === 'history' ? round ? `Round ${round}` : 'Snapshot' : kind === 'head' ? 'Since HEAD' : 'Current round');
  let attention = $derived(kind === 'history' && (newer || reminder > 0));
  const options = [{ value: 'latest', label: 'Current round', icon: Radio }, { value: 'head', label: 'Since HEAD', icon: GitCompareArrows }] as const;
</script>

{#snippet currentRoundIndicator()}
  {#if attention}
    {#key reminder}
      <span class={['relative size-1.5 shrink-0 rounded-full bg-primary ring-2 ring-background', reminder && !reducedMotion && 'animate-pulse [animation-duration:450ms] [animation-iteration-count:3] motion-reduce:animate-none']} data-current-round-indicator data-reminder={reminder} aria-hidden="true">
        {#if reminder && !reducedMotion}<span class="absolute inset-0 animate-ping rounded-full bg-primary [animation-duration:450ms] [animation-iteration-count:3] motion-reduce:animate-none"></span>{/if}
      </span>
    {/key}
  {/if}
{/snippet}

<div class="file-comparison flex min-w-0 flex-wrap items-center gap-1" role="group" aria-label={`Comparison for ${path}`}>
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props: trigger })}
        <Hint text={attention ? 'Newer changes in Current round' : ''}>
        {#snippet children({ props: hint })}
        <Button {...mergeProps(trigger, hint)} variant="ghost" size="sm" class="gap-2 text-xs" disabled={busy} aria-label={`File comparison: ${label}${kind === 'history' ? ' · Read-only' : ''}${attention ? ' · Newer changes in Current round' : ''}`}>
          {#if busy}<LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" />{:else if kind === 'history'}<LockKeyhole class="size-3.5" />{/if}
          {label}{#if kind === 'history'}<span class="file-readonly-label text-muted-foreground">· Read-only</span>{/if}{@render currentRoundIndicator()}<ChevronDown class="size-3 text-muted-foreground" />
        </Button>
        {/snippet}
        </Hint>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content variant="panel" align="end" sideOffset={8} class="w-56 gap-1 p-2" aria-label={`File comparison options for ${path}`}>
      <p class="px-2 py-2 text-xs font-medium text-muted-foreground">This file</p>
      {#each options as option}
        <Button variant="ghost" class="justify-start gap-2 aria-pressed:bg-muted aria-pressed:text-foreground" aria-pressed={kind === option.value} onclick={() => { open = false; onselect(option.value); }}>
          <option.icon /><span class="flex-1 text-left">{option.label}</span>{#if option.value === 'latest'}{@render currentRoundIndicator()}{/if}{#if kind === option.value}<Check class="size-3.5" />{/if}
        </Button>
      {/each}
    </Popover.Content>
  </Popover.Root>
  {#if historyCount}
    <Hint text={`${expanded ? 'Hide' : 'Show'} review history`}>
      {#snippet children({ props })}
        <Button {...mergeProps(props, { onclick: () => expanded = !expanded })} data-tutorial="history" variant="ghost" size="sm" class="gap-1.5 text-xs" aria-label={`History: ${historyCount} previous round${historyCount === 1 ? '' : 's'}`} aria-expanded={expanded}><History class="size-3.5" /><span class="file-history-label">History</span><span class="text-muted-foreground tabular-nums">{historyCount}</span></Button>
      {/snippet}
    </Hint>
  {/if}
</div>
