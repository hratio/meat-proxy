<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import type { Finding } from '$lib/types';
  import CommentThread from './CommentThread.svelte';

  let { findings, ...props }: Omit<ComponentProps<typeof CommentThread>, 'finding'> & { findings: Finding[] } = $props();
</script>

<div class="min-w-0 px-2" data-cursor="native">
  {#each findings as finding (finding.id)}<CommentThread {finding} {...props} />{/each}
</div>
