<script lang="ts">
  import { goto } from '$app/navigation';
  import { ArrowLeft, ListChecks } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import Findings from '$lib/components/Findings.svelte';
  import { configSchema, type Catalog, type Config } from '$lib/config';
  import { sampleCatalog, sampleFindings } from '$workbench/damage-report/demo';
  import type { Action, Bootstrap, DiffFile, Finding } from '$lib/types';

  let source = $state<'sample' | 'current'>('sample');
  let open = $state(true);
  let loading = $state(false), error = $state('');
  let findings = $state<Finding[]>(structuredClone(sampleFindings));
  let catalog = $state<Catalog>(sampleCatalog);
  let config = $state<Config>(configSchema.parse({ editor: { enabled: false } }));
  let files = $state<DiffFile[]>([]);
  let reviewId = $state('sample');

  function useSample() {
    source = 'sample'; findings = structuredClone(sampleFindings); catalog = sampleCatalog;
    config = configSchema.parse({ editor: { enabled: false } }); files = []; reviewId = 'sample'; open = true; error = '';
  }
  async function useCurrent() {
    loading = true; error = '';
    try {
      const response = await fetch('/api/bootstrap?manifest');
      if (!response.ok) throw new Error('Could not load the current review.');
      const data: Bootstrap = await response.json();
      findings = data.snapshot.review.findings; files = data.snapshot.files;
      catalog = data.catalog; config = data.config; reviewId = data.snapshot.review.id;
      source = 'current'; open = true;
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { loading = false; }
  }
  async function act(action: Action): Promise<boolean> {
    if (source === 'current') {
      const response = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewId, action }) });
      if (!response.ok) { error = 'Could not update the finding.'; return false; }
      await useCurrent(); return true;
    }
    if (action.type === 'delete') findings = findings.filter(finding => finding.id !== action.id);
    else if (action.type === 'resolve' || action.type === 'reopen') {
      findings = findings.map(finding => finding.id === action.id ? { ...finding, status: action.type === 'resolve' ? 'resolved' : 'open' } : finding);
    } else if (action.type === 'reply') {
      findings = findings.map(finding => finding.id === action.id ? { ...finding, replies: [...finding.replies || [], { id: crypto.randomUUID(), role: 'reviewer', comment: action.comment, createdAt: new Date().toISOString() }] } : finding);
    } else if (action.type === 'delete-reply') {
      findings = findings.map(finding => finding.id === action.id ? { ...finding, replies: finding.replies?.filter(reply => reply.id !== action.replyId) } : finding);
    }
    return true;
  }
</script>

<svelte:head><title>Damage Report · Design preview</title></svelte:head>

<main class="min-h-dvh bg-background px-6 py-8 text-foreground" data-cursor="native">
  <div class="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4">
    <Button href="/" variant="link" class="h-auto p-0 text-muted-foreground"><ArrowLeft />Back to review</Button>
    <div class="flex flex-wrap items-center gap-2">
      <Button variant="outline" selected={source === 'sample'} onclick={useSample}>Sample review</Button>
      <Button variant="outline" selected={source === 'current'} disabled={loading} onclick={useCurrent}>{loading ? 'Loading…' : 'Use current review'}</Button>
      <Button variant="secondary" onclick={() => open = true}><ListChecks />Open damage report</Button>
    </div>
  </div>
  {#if error}<p role="alert" class="mx-auto mt-4 max-w-[1440px] text-sm text-destructive">{error}</p>{/if}
  <Findings {open} {reviewId} {findings} {files} {catalog} {config} exportDisabled={source === 'sample'} onaction={act} onjump={() => goto('/')} onclose={() => open = false} />
</main>
