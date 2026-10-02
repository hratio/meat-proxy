<script lang="ts">
  import { CheckCheck, FileText, Trash2 } from '@lucide/svelte';
  import type { Catalog, Config } from '$lib/config';
  import type { Action, DiffFile, Finding } from '$lib/types';
  import type { ReportFile } from '$lib/damage-report';
  import { Button } from '$lib/components/ui/button';
  import FilePathActions from '../FilePathActions.svelte';
  import ReportRows from './ReportRows.svelte';

  let { file, files, catalog, config, reviewId, expandedId, selectedIds, pendingIds, onselect, onbatch, onexpand, onaction, onjump }: {
    file: ReportFile; files: DiffFile[]; catalog: Catalog; config: Config; reviewId: string; expandedId: string;
    selectedIds: Set<string>; pendingIds: Set<string>; onselect: (ids: string[], checked: boolean) => void; onbatch: (type: 'resolve' | 'delete', ids: string[]) => Promise<void>;
    onexpand: (id: string) => void; onaction: (action: Action) => Promise<boolean>; onjump: (finding: Finding) => void;
  } = $props();
  const directory = $derived(file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '');
  const filename = $derived(file.path.split('/').at(-1));
  const selected = $derived(file.findings.filter(finding => selectedIds.has(finding.id)));
  const busy = $derived(file.findings.some(finding => pendingIds.has(finding.id)));
  const canResolve = $derived(selected.some(finding => finding.status === 'open'));
</script>

<section class="@container/report-file min-w-0 space-y-4 p-5" data-report-file={file.path} aria-label={file.path}>
  <header class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
    <FileText class="size-4 shrink-0 text-muted-foreground" />
    <h3 class="flex min-w-0 flex-1 items-baseline gap-1.5 font-mono text-sm" title={file.path}>
      {#if directory}<span class="truncate text-muted-foreground">{directory}</span><span class="text-muted-foreground/50">/</span>{/if}
      <strong class="truncate font-medium">{filename}</strong>
    </h3>
    <span class="shrink-0 text-xs text-muted-foreground">{selected.length ? `${selected.length} selected` : `${file.findings.length} ${file.findings.length === 1 ? 'finding' : 'findings'}`}</span>
    <div class="ml-2 flex shrink-0 items-center gap-1">
      <FilePathActions path={file.path} {reviewId} {config} />
      <span class="mx-1 h-4 w-px bg-border" aria-hidden="true"></span>
      <Button variant="ghost" size="icon-sm" disabled={!canResolve || busy} aria-label={`Resolve selected findings in ${file.path}`} title="Mark selected findings resolved" onclick={() => onbatch('resolve', selected.map(finding => finding.id))}><CheckCheck /></Button>
      <Button variant="destructive-ghost" size="icon-sm" disabled={!selected.length || busy} aria-label={`Delete selected findings in ${file.path}`} title="Delete selected findings" onclick={() => onbatch('delete', selected.map(finding => finding.id))}><Trash2 /></Button>
    </div>
  </header>
  <ReportRows findings={file.findings} path={file.path} {files} {catalog} {reviewId} {expandedId} {selectedIds} {pendingIds} {onselect} {onexpand} {onaction} {onjump} />
</section>
