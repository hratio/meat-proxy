<script lang="ts">
  import { isDemo, reviewFetch } from '$review-client';
  import { Download } from '@lucide/svelte';
  import { toast } from '$lib/notifications';
  import type { Catalog, Config } from '$lib/config';
  import type { Action, DiffFile, Finding } from '$lib/types';
  import { Button } from '$lib/components/ui/button';
  import Modal from './Modal.svelte';
  import PanelFooter from './PanelFooter.svelte';
  import FindingSnapshot from './FindingSnapshot.svelte';
  import DamageReport from './damage-report/DamageReport.svelte';

  let { open, filter = $bindable('open'), reviewId, findings, files, catalog, config, onaction, onjump, onclose, exportDisabled = false }: {
    open: boolean; filter?: string; reviewId: string; findings: Finding[]; files: DiffFile[]; catalog: Catalog; config: Config; exportDisabled?: boolean;
    onaction: (action: Action) => Promise<boolean>; onjump: (finding: Finding) => void; onclose: () => void;
  } = $props();
  let original = $state<Finding>();
  const openCount = $derived(findings.filter(finding => finding.status === 'open').length);
  const fileCount = $derived(new Set(findings.map(finding => finding.path)).size);
  function jump(finding: Finding) {
    if (finding.version && !files.some(file => file.path === finding.path)) original = finding;
    else {
      onjump(finding);
      if (files.some(file => file.path === finding.path)) onclose();
    }
  }
  const exportUrl = (format: string) => `/api/export?format=${format}&catalog=${config.export.includeCatalog}&examples=${config.export.includeExamples}&resolved=${config.export.includeResolved}`;
  async function downloadDemo(format: 'json' | 'markdown') {
    try {
      const response = await reviewFetch(exportUrl(format));
      if (!response.ok) throw new Error('Could not export the review.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `review-${reviewId}.${format === 'json' ? 'json' : 'md'}`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(String(error)); }
  }
</script>

{#if open}
  <Modal title={`The damage · ${findings.length.toString().padStart(2, '0')}`} eyebrow="After-action report" floating fixedHeight size="xl" layoutKey="damage-report" closeLabel="Close findings" {onclose}>
    {#snippet headerActions()}
      <div class="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs max-sm:hidden" aria-label="Review findings summary">
        <span><strong class="mr-1.5 font-mono text-sm tabular-nums">{openCount}</strong><span class="text-muted-foreground">open</span></span>
        <span><strong class="mr-1.5 font-mono text-sm tabular-nums text-(--green)">{findings.length - openCount}</strong><span class="text-muted-foreground">resolved</span></span>
        <span><strong class="mr-1.5 font-mono text-sm tabular-nums">{fileCount}</strong><span class="text-muted-foreground">{fileCount === 1 ? 'file' : 'files'}</span></span>
      </div>
    {/snippet}
    <DamageReport bind:filter {reviewId} {findings} {files} {catalog} {config} {onaction} onjump={jump} />
    <PanelFooter class="justify-start gap-2">
      <Button variant="outline" size="sm" disabled={exportDisabled} href={isDemo ? undefined : exportUrl('markdown')} onclick={isDemo ? () => downloadDemo('markdown') : undefined} download><Download />Markdown</Button>
      <Button variant="outline" size="sm" disabled={exportDisabled} href={isDemo ? undefined : exportUrl('json')} onclick={isDemo ? () => downloadDemo('json') : undefined} download><Download />JSON</Button>
    </PanelFooter>
  </Modal>
{/if}

{#if original}
  {#key `${reviewId}:${original.id}`}<FindingSnapshot {reviewId} finding={original} onclose={() => original = undefined} />{/key}
{/if}
