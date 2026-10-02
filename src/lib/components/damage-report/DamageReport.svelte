<script lang="ts">
  import { CheckCheck, LayoutList, ListTree, Search, X } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import type { Catalog, Config } from '$lib/config';
  import type { Action, DiffFile, Finding } from '$lib/types';
  import { createReportSearch, groupReportFiles, reportFindings, reportSortOptions, type ReportSort } from '$lib/damage-report';
  import { Button } from '$lib/components/ui/button';
  import * as InputGroup from '$lib/components/ui/input-group';
  import * as Resizable from '$lib/components/ui/resizable';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import SingleSelect from '../SingleSelect.svelte';
  import ReportFile from './ReportFile.svelte';
  import ReportFileTree from './ReportFileTree.svelte';
  import ReportOverview from './ReportOverview.svelte';

  let { filter = $bindable('open'), findings, files, catalog, config, reviewId, onaction, onjump }: {
    filter?: string; findings: Finding[]; files: DiffFile[]; catalog: Catalog; config: Config; reviewId: string;
    onaction: (action: Action) => Promise<boolean>; onjump: (finding: Finding) => void;
  } = $props();
  let mode = $state('explorer');
  let query = $state('');
  let sort = $state<ReportSort>('violations');
  let selectedPath = $state('');
  let expandedId = $state('');
  let selectedIds = $state(new Set<string>());
  let pendingIds = $state(new Set<string>());
  const all = $derived(reportFindings(findings, catalog));
  const search = $derived(createReportSearch(all));
  const matches = $derived(query.trim() ? new Set(search.search(query.trim()).map(result => String(result.id))) : undefined);
  const visible = $derived(all.filter(finding => (filter === 'all' || finding.status === filter) && (!matches || matches.has(finding.id))));
  const entries = $derived(groupReportFiles(visible, sort));
  const selectedFile = $derived(entries.find(file => file.path === selectedPath) ?? entries[0]);
  const resetKey = $derived(JSON.stringify([filter, query, sort]));
  function expand(id: string) { expandedId = expandedId === id ? '' : id; }
  function clearFilters() { query = ''; filter = 'all'; }

  function select(ids: string[], checked: boolean) {
    const next = new Set(selectedIds);
    for (const id of ids) if (checked) next.add(id); else next.delete(id);
    selectedIds = next;
  }
  // Bulk actions only include selections in the current search and status filter.
  $effect(() => {
    const ids = new Set(visible.map(finding => finding.id));
    untrack(() => {
      if ([...selectedIds].some(id => !ids.has(id))) selectedIds = new Set([...selectedIds].filter(id => ids.has(id)));
    });
  });
  async function apply(action: Action) {
    const result = await onaction(action);
    if (result && 'id' in action && ['resolve', 'reopen', 'delete'].includes(action.type)) select([action.id], false);
    return result;
  }
  async function act(action: Action): Promise<boolean> {
    if (!('id' in action)) return apply(action);
    const id = action.id;
    if (pendingIds.has(id)) return false;
    pendingIds = new Set([...pendingIds, id]);
    try { return await apply(action); }
    finally { pendingIds = new Set([...pendingIds].filter(pending => pending !== id)); }
  }
  async function actSelected(type: 'resolve' | 'delete', ids: string[]) {
    const chosen = new Set(ids);
    const actions = visible.filter(finding => chosen.has(finding.id) && !pendingIds.has(finding.id) && (type !== 'resolve' || finding.status === 'open')).map(finding => ({ type, id: finding.id }));
    const reserved = new Set(actions.map(action => action.id));
    pendingIds = new Set([...pendingIds, ...reserved]);
    try { for (const action of actions) await apply(action); }
    finally { pendingIds = new Set([...pendingIds].filter(id => !reserved.has(id))); }
  }
</script>

<div class="@container/report flex min-h-0 flex-1 flex-col" data-damage-report>
  <div class="report-controls flex shrink-0 flex-wrap items-end gap-3 border-b border-border bg-background/25 px-5 py-3">
    <div class="w-32"><SingleSelect label="Status" bind:value={filter} options={[{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: 'all', label: 'All findings' }]} /></div>
    <div class="report-sort w-52"><SingleSelect label="Sort by" value={sort} onchange={value => sort = value as ReportSort} options={reportSortOptions} /></div>
    <InputGroup.Root class="h-9 min-w-44 flex-1 self-end">
      <InputGroup.Input aria-label="Search findings" placeholder="Find a file, rule or comment…" bind:value={query} />
      <InputGroup.Addon><Search /></InputGroup.Addon>
      {#if query}<InputGroup.Addon align="inline-end"><Button variant="ghost" size="icon-xs" aria-label="Clear findings search" onclick={() => query = ''}><X /></Button></InputGroup.Addon>{/if}
    </InputGroup.Root>
    <ToggleGroup.Root type="single" value={mode} onValueChange={value => { if (value) mode = value; }} variant="outline" role="radiogroup" aria-label="Report display" class="h-9 self-end">
      <ToggleGroup.Item value="explorer" aria-label="File explorer" title="File explorer" class="h-9"><ListTree class="size-4" /><span class="report-mode-label">File explorer</span></ToggleGroup.Item>
      <ToggleGroup.Item value="all" aria-label="All files" title="All files" class="h-9"><LayoutList class="size-4" /><span class="report-mode-label">All files</span></ToggleGroup.Item>
    </ToggleGroup.Root>
  </div>
  {#if !entries.length}
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <CheckCheck class="size-8 text-muted-foreground" />
      <h3 class="font-semibold">{findings.length ? 'No matching findings' : 'No findings in this review'}</h3>
      {#if findings.length}<Button variant="outline" size="sm" onclick={clearFilters}>Show all findings</Button>{/if}
    </div>
  {:else if mode === 'explorer'}
    <Resizable.PaneGroup direction="horizontal" autoSaveId="damage-report-explorer" class="min-h-0 flex-1 overflow-hidden" keyboardResizeBy={2}>
      <Resizable.Pane defaultSize={22} minSize={15} maxSize={50} class="min-w-0" data-report-tree-pane>
        <ReportFileTree files={entries} selectedPath={selectedFile.path} {sort} onselect={path => selectedPath = path} />
      </Resizable.Pane>
      <Resizable.Handle withHandle aria-label="Resize findings file tree" data-cursor="native" />
      <Resizable.Pane defaultSize={78} minSize={50} class="min-w-0">
        <ScrollArea type="auto" class="h-full min-h-0 min-w-0" data-report-selected-file>
          {#key selectedFile.path}<ReportFile file={selectedFile} {files} {catalog} {config} {reviewId} {expandedId} {selectedIds} {pendingIds} onselect={select} onbatch={actSelected} onexpand={expand} onaction={act} {onjump} />{/key}
        </ScrollArea>
      </Resizable.Pane>
    </Resizable.PaneGroup>
  {:else}
    <ReportOverview {entries} {files} {catalog} {config} {reviewId} {expandedId} {selectedIds} {pendingIds} {resetKey} onselect={select} onbatch={actSelected} onexpand={expand} onaction={act} {onjump} />
  {/if}
</div>

<style>
  @container report (max-width: 1000px) { .report-mode-label { display: none; } }
  @container report (max-width: 640px) {
    .report-controls { padding-inline: 12px; gap: 8px; }
    .report-sort { flex: 1; width: auto; }
  }
</style>
