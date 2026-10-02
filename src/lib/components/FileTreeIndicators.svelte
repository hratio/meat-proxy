<script lang="ts">
  import { Info, TriangleAlert, Check } from '@lucide/svelte';
  import Hint from './Hint.svelte';

  let { finding, comment, reviewed, gitStatus }: { finding: boolean; comment: boolean; reviewed: boolean; gitStatus?: string } = $props();
  const gitDescriptions: Record<string, string> = { A: 'Added', D: 'Deleted', M: 'Modified', R: 'Renamed', '?': 'Untracked', C: 'Copied', T: 'Type changed', U: 'Unmerged' };
  let gitCode = $derived(gitStatus?.[0]);
  let gitLabel = $derived(gitCode ? `Git status: ${gitDescriptions[gitCode] ?? 'Changed'}` : '');
</script>

<div data-file-indicators>
  {#if finding}
    <Hint text="Unresolved findings">
      {#snippet children({ props })}<span {...props} data-file-indicator="finding" role="img" aria-label="Unresolved findings"><TriangleAlert size={14} /></span>{/snippet}
    </Hint>
  {/if}
  {#if comment}
    <Hint text="Unresolved comments">
      {#snippet children({ props })}<span {...props} data-file-indicator="comment" role="img" aria-label="Unresolved comments"><Info size={14} /></span>{/snippet}
    </Hint>
  {/if}
  {#if reviewed}
    <Hint text="Reviewed">
      {#snippet children({ props })}<span {...props} data-file-indicator="reviewed" role="img" aria-label="Reviewed"><Check size={14} /></span>{/snippet}
    </Hint>
  {/if}
  {#if gitCode}
    <Hint text={gitLabel}>
      {#snippet children({ props })}<span {...props} data-file-indicator="git" role="img" aria-label={gitLabel}>{gitCode}</span>{/snippet}
    </Hint>
  {/if}
</div>
