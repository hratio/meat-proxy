<script lang="ts">
  import type { Snippet } from 'svelte';
  let { actions, back }: { actions: Snippet; back?: Snippet } = $props();
</script>

<footer data-catalog-footer class="flex shrink-0 items-center justify-between gap-4 border-t border-border bg-card px-5 py-4">
  <div class="min-w-0">{@render back?.()}</div>
  <div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
</footer>
