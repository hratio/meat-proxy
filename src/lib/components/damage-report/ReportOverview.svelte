<script lang="ts">
  import { untrack } from 'svelte';
  import { createVirtualizer, defaultRangeExtractor } from '@tanstack/svelte-virtual';
  import type { Catalog, Config } from '$lib/config';
  import type { Action, DiffFile, Finding } from '$lib/types';
  import type { ReportFile as ReportFileData } from '$lib/damage-report';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import ReportFile from './ReportFile.svelte';

  let { entries, files, catalog, config, reviewId, expandedId, selectedIds, pendingIds, resetKey, onselect, onbatch, onexpand, onaction, onjump }: {
    entries: ReportFileData[]; files: DiffFile[]; catalog: Catalog; config: Config; reviewId: string; expandedId: string; resetKey: string;
    selectedIds: Set<string>; pendingIds: Set<string>; onselect: (ids: string[], checked: boolean) => void; onbatch: (type: 'resolve' | 'delete', ids: string[]) => Promise<void>;
    onexpand: (id: string) => void; onaction: (action: Action) => Promise<boolean>; onjump: (finding: Finding) => void;
  } = $props();
  let viewport = $state<HTMLElement | null>(null);
  let focusedPath = $state('');
  const virtualizer = createVirtualizer<HTMLElement, HTMLElement>({ count: 0, getScrollElement: () => null, estimateSize: () => 200, overscan: 2 });
  $effect(() => {
    const items = entries, element = viewport, focusedIndex = entries.findIndex(file => file.path === focusedPath);
    untrack(() => $virtualizer.setOptions({
      count: items.length, getScrollElement: () => element, getItemKey: index => items[index].path,
      estimateSize: index => 117 + items[index].findings.length * 45,
      rangeExtractor: range => [...new Set([...defaultRangeExtractor(range), ...(focusedIndex >= 0 ? [focusedIndex] : [])])].sort((a, b) => a - b)
    }));
  });
  $effect(() => { resetKey; if (viewport) untrack(() => $virtualizer.scrollToOffset(0)); });

  function measure(node: HTMLElement) {
    untrack(() => $virtualizer.measureElement(node));
    return { destroy: () => untrack(() => $virtualizer.measureElement(null)) };
  }
</script>

<ScrollArea bind:viewportRef={viewport} type="auto" class="h-full min-h-0 min-w-0 flex-1" data-report-overview
  onfocusin={event => focusedPath = (event.target as HTMLElement).closest<HTMLElement>('[data-report-file]')?.dataset.reportFile ?? ''}
  onfocusout={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) focusedPath = ''; }}>
  <div class="relative w-full" style:height={`${$virtualizer.getTotalSize()}px`}>
    <!-- Keep stale virtual indices from displaying a different filtered file. -->
    {#each $virtualizer.getVirtualItems() as item (item.key)}
      {@const file = entries[item.index]}
      {#if file && file.path === item.key}
      <div use:measure data-index={item.index} class="absolute inset-x-0 top-0 border-b border-border" style:transform={`translateY(${item.start}px)`}>
        <ReportFile {file} {files} {catalog} {config} {reviewId} {expandedId} {selectedIds} {pendingIds} {onselect} {onbatch} {onexpand} {onaction} {onjump} />
      </div>
      {/if}
    {/each}
  </div>
</ScrollArea>
