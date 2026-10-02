<script lang="ts">
  import { ArrowUpRight, Check, ChevronDown, ChevronRight, MessageSquare, Trash2, Undo2 } from '@lucide/svelte';
  import type { Catalog } from '$lib/config';
  import type { Action, DiffFile, Finding } from '$lib/types';
  import type { ReportFinding } from '$lib/damage-report';
  import { hasLocation } from '$lib/location';
  import { useUi } from '$lib/ui/context.svelte';
  import { userPalette } from '$lib/ui/user-colors';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as Table from '$lib/components/ui/table';
  import CodeExample from '../hud/CodeExample.svelte';
  import CommentThread from '../CommentThread.svelte';

  let { findings, path, files, catalog, reviewId, expandedId, selectedIds, pendingIds, onselect, onexpand, onaction, onjump }: {
    findings: ReportFinding[]; path: string; files: DiffFile[]; catalog: Catalog; reviewId: string; expandedId: string;
    selectedIds: Set<string>; pendingIds: Set<string>; onselect: (ids: string[], checked: boolean) => void;
    onexpand: (id: string) => void; onaction: (action: Action) => Promise<boolean>; onjump: (finding: Finding) => void;
  } = $props();
  const ui = useUi();
  const id = $props.id();
  const selectedCount = $derived(findings.filter(finding => selectedIds.has(finding.id)).length);
  function clickRow(event: MouseEvent, finding: Finding) {
    if (!(event.target as HTMLElement).closest('button, a, input, [role="checkbox"]')) onexpand(finding.id);
  }
</script>

<div class="overflow-hidden rounded-lg border border-border">
  <Table.Root class="min-w-[540px] table-fixed border-collapse" aria-label={`Findings in ${path}`}>
    <colgroup>
      <col style="width:40px" /><col style="width:56px" /><col /><col style="width:88px" /><col style="width:96px" /><col style="width:80px" />
    </colgroup>
    <Table.Header class="border-b border-border bg-background/30">
      <Table.Row class="hover:bg-transparent">
        <Table.Head scope="col" class="pl-3">
          <Checkbox checked={selectedCount === findings.length} indeterminate={selectedCount > 0 && selectedCount < findings.length}
            disabled={findings.some(finding => pendingIds.has(finding.id))} aria-label={`Select all findings in ${path}`}
            onCheckedChange={checked => onselect(findings.map(finding => finding.id), checked)} />
        </Table.Head>
        <Table.Head scope="col" class="text-xs text-muted-foreground">Rule</Table.Head>
        <Table.Head scope="col" class="text-xs text-muted-foreground">Finding</Table.Head>
        <Table.Head scope="col" class="text-xs text-muted-foreground">Severity</Table.Head>
        <Table.Head scope="col" class="text-xs text-muted-foreground">Status</Table.Head>
        <Table.Head scope="col"><span class="sr-only">Actions</span></Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each findings as finding (finding.id)}
        {@const expanded = expandedId === finding.id}
        {@const contextId = `${id}-${finding.id}`}
        {@const color = userPalette(finding.groupColor, ui.colors).foreground}
        {@const pending = pendingIds.has(finding.id)}
        <Table.Row data-report-row={finding.id} data-state={selectedIds.has(finding.id) ? 'selected' : undefined} class="border-border/60 last:border-0" onclick={event => clickRow(event, finding)}>
          <Table.Cell class="pl-3">
            <Checkbox checked={selectedIds.has(finding.id)} disabled={pending} aria-label={`Select finding ${finding.code || 'comment'} in ${path}`}
              onCheckedChange={checked => onselect([finding.id], checked)} />
          </Table.Cell>
          <Table.Cell class="font-mono text-xs text-muted-foreground">{finding.code || 'NOTE'}</Table.Cell>
          <Table.Cell class="p-0">
            <Button variant="ghost" class="min-h-11 w-full justify-start gap-2 rounded-none px-2 py-2.5 text-left text-sm"
              data-report-finding={finding.id} aria-label={`Inspect ${finding.code || 'comment'} in ${finding.path}`}
              aria-expanded={expanded} aria-controls={expanded ? contextId : undefined} onclick={() => onexpand(finding.id)}>
              <span class="min-w-0 flex-1 truncate text-sm font-medium">{finding.code ? finding.rule?.title || finding.code : finding.comment || 'Reviewer comment'}</span>
              {#if expanded}<ChevronDown class="size-3.5 text-muted-foreground" />{:else}<ChevronRight class="size-3.5 text-muted-foreground" />{/if}
            </Button>
          </Table.Cell>
          <Table.Cell class="text-xs text-muted-foreground">{finding.rule?.severity || 'comment'}</Table.Cell>
          <Table.Cell class="text-xs text-muted-foreground">
            <span class="flex items-center gap-1.5">
              {#if finding.status === 'resolved'}<Check class="size-3.5 text-(--green)" /><span>Resolved</span>
              {:else}<span class="mx-1 size-1.5 rounded-full" style:background={color}></span><span>Open</span>{/if}
            </span>
          </Table.Cell>
          <Table.Cell class="pr-3">
            <div class="flex justify-end gap-1">
              <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={finding.status === 'open' ? 'Mark finding resolved' : 'Reopen finding'} title={finding.status === 'open' ? 'Mark resolved' : 'Reopen'}
                onclick={() => onaction({ type: finding.status === 'open' ? 'resolve' : 'reopen', id: finding.id })}>
                {#if finding.status === 'open'}<Check />{:else}<Undo2 />{/if}
              </Button>
              <Button variant="destructive-ghost" size="icon-sm" disabled={pending} aria-label="Delete finding" title="Delete finding" onclick={() => onaction({ type: 'delete', id: finding.id })}><Trash2 /></Button>
            </div>
          </Table.Cell>
        </Table.Row>
        {#if expanded}
          <Table.Row class="border-border last:border-0 hover:bg-transparent">
            <Table.Cell colspan={6} class="p-0 whitespace-normal">
              <div id={contextId} class="finding-inset space-y-4 px-5 py-5" data-report-context={finding.id}>
                {#if finding.code}
                  <div>
                    <h5 class="flex items-baseline gap-2.5 text-sm font-semibold"><span class="font-mono text-xs" style:color>{finding.code}</span>{finding.rule?.title || finding.code}</h5>
                    {#if finding.rule?.description}<p class="mt-2 max-w-4xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{finding.rule.description}</p>{/if}
                  </div>
                  {#if finding.rule?.bad?.trim() || finding.rule?.good?.trim()}
                    <div class="report-examples grid min-w-0 gap-3">
                      {#if finding.rule?.bad?.trim()}
                        <div class="min-w-0 overflow-hidden rounded-md border border-border bg-[var(--hud-well,#0a1110)]">
                          <h6 class="border-b border-white/10 px-3 py-2 text-xs font-medium text-[#e79b92]">Bad example</h6>
                          <div class="max-h-64 overflow-auto py-2"><CodeExample code={finding.rule.bad} label={`${finding.code} bad example`} /></div>
                        </div>
                      {/if}
                      {#if finding.rule?.good?.trim()}
                        <div class="min-w-0 overflow-hidden rounded-md border border-border bg-[var(--hud-well,#0a1110)]">
                          <h6 class="border-b border-white/10 px-3 py-2 text-xs font-medium text-[#9bc9a2]">Good example</h6>
                          <div class="max-h-64 overflow-auto py-2"><CodeExample code={finding.rule.good} label={`${finding.code} good example`} /></div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                  {#if finding.comment}<p class="whitespace-pre-wrap text-sm leading-relaxed">{finding.comment}</p>{/if}
                  {#if finding.resolution}<p class="border-l-2 border-(--green) pl-3 text-sm whitespace-pre-wrap text-(--green)">{finding.resolution}</p>{/if}
                  <div class="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onclick={() => onjump(finding)}><ArrowUpRight />{finding.version ? 'View revision' : 'Jump to diff'}</Button>
                  </div>
                {:else}
                  <div class="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span class="flex items-center gap-2"><MessageSquare class="size-3.5" />{finding.replies?.length ? `${finding.replies.length + 1} comments` : 'Reviewer comment'}</span><Button variant="outline" size="sm" onclick={() => onjump(finding)}><ArrowUpRight />{finding.version ? 'View revision' : 'Jump to diff'}</Button></div>
                  <CommentThread {finding} {catalog} {reviewId} outOfView={!hasLocation(files, finding)}
                    onreply={(id, comment) => onaction({ type: 'reply', id, comment })}
                    ondeletereply={(id, replyId) => onaction({ type: 'delete-reply', id, replyId })}
                    onresolve={id => onaction({ type: 'resolve', id })} onreopen={id => onaction({ type: 'reopen', id })}
                    ondelete={id => onaction({ type: 'delete', id })} onhistory={onjump} />
                {/if}
              </div>
            </Table.Cell>
          </Table.Row>
        {/if}
      {/each}
    </Table.Body>
  </Table.Root>
</div>

<style>
  .finding-inset { background: color-mix(in oklab, var(--background), black 12%); box-shadow: inset 0 4px 8px #0002; }
  .report-examples { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @container report-file (max-width: 560px) {
    .report-examples { grid-template-columns: minmax(0, 1fr); }
  }
</style>
