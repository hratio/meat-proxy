<script lang="ts">
  import type { ComponentProps, Snippet } from 'svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';

  let { text = '', content, children, side = 'top', disabled = false }: {
    text?: string;
    content?: Snippet;
    children: NonNullable<ComponentProps<typeof Tooltip.Trigger>['child']>;
    side?: ComponentProps<typeof Tooltip.Content>['side'];
    disabled?: boolean;
  } = $props();
</script>

<Tooltip.Root disabled={disabled || (!text && !content)}>
  <Tooltip.Trigger child={children} />
  <Tooltip.Content {side}>{#if content}{@render content()}{:else}{text}{/if}</Tooltip.Content>
</Tooltip.Root>
