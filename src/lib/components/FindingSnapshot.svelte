<script lang="ts">
  import { reviewFetch as fetch } from '$review-client';
  import { onMount } from 'svelte';
  import type { DiffFile, Finding } from '$lib/types';
  import { rangeLabel } from '$lib/location';
  import Modal from './Modal.svelte';

  let { reviewId, finding, onclose }: { reviewId: string; finding: Finding; onclose: () => void } = $props();
  let file = $state<DiffFile>();
  let error = $state('');
  onMount(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ reviewId, path: finding.path, finding: finding.id });
    void fetch(`/api/file?${query}`, { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load the original context.');
      file = result.file;
    }).catch(reason => { if (!controller.signal.aborted) error = String(reason); });
    return () => controller.abort();
  });
</script>

<Modal title="Original finding context" wide {onclose}>
  <div class="border-b border-border px-6 py-4 text-sm">
    <p class="break-all font-mono">{finding.path}{finding.ranges ? `:${rangeLabel(finding, true)}` : ''}</p>
    <p class="mt-2 text-muted-foreground">This file is outside the current diff. These are the changes the finding was attached to.</p>
  </div>
  {#if error}<p role="alert" class="p-6 text-sm text-destructive">{error}</p>
  {:else if !file}<p role="status" class="p-6 text-sm text-muted-foreground">Loading original context…</p>
  {:else if file.omitted || file.binary || !file.patch}<p class="p-6 text-sm text-muted-foreground">{file.omitted || (file.binary ? 'Binary file — no text preview.' : 'No text changes in this snapshot.')}</p>
  {:else}
    <pre class="max-h-[60vh] overflow-auto p-6 font-mono text-xs leading-relaxed" aria-label="Original diff">{file.patch}</pre>
  {/if}
</Modal>
