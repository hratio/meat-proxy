<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  let { class: className, children, ...props }: HTMLAttributes<HTMLElement> = $props();
</script>

<footer class={cn('flex min-h-7.5 shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-3', className)} data-panel-footer {...props}>
  {@render children?.()}
</footer>
