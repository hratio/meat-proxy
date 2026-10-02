<script lang="ts">
  import type { Snippet } from 'svelte';
  import { CircleCheck, OctagonX, Info, TriangleAlert, LoaderCircle, X } from '@lucide/svelte';
  import type { NotificationKind } from '$lib/notifications';
  import { Button } from '$lib/components/ui/button';
  import HudFrame from './HudFrame.svelte';

  let { message, description, kind = 'message', closable = true, dismiss, actions }: {
    message: string; description?: string; kind?: NotificationKind; closable?: boolean; dismiss: () => void; actions?: Snippet;
  } = $props();
  const Icon = $derived(kind === 'success' ? CircleCheck : kind === 'error' ? OctagonX : kind === 'warning' ? TriangleAlert : kind === 'loading' ? LoaderCircle : Info);
  const color = $derived(kind === 'success' ? '#b4d592' : kind === 'error' ? '#f29c8e' : kind === 'warning' ? '#edbf73' : 'var(--primary)');
</script>

<div class="hud-notification w-full min-w-0 drop-shadow-[0_5px_12px_#0008]" data-message-plate data-notification-kind={kind} data-cursor="native"
  style:--hud-accent={color}>
  <HudFrame variant="panel">
    <div class="p-2.5">
      <HudFrame variant="inset">
      <div class="flex min-h-12.5 items-start gap-2.5 px-4 py-3.5">
        <Icon class={['mt-0.5 size-4 shrink-0 text-(--hud-accent)', kind === 'loading' && 'animate-spin motion-reduce:animate-none']} />
        <div class="min-w-0 flex-1">
          <p data-fragment-text class="m-0 font-sans text-[13px] leading-snug font-semibold wrap-anywhere text-[#e5e8d5]">{message}</p>
          {#if description}<p data-fragment-text class="mt-2 mb-0 border-t border-(--hud-accent)/25 pt-2 font-sans text-xs leading-relaxed wrap-anywhere whitespace-pre-wrap text-[#c5cab7]">{description}</p>{/if}
          {#if actions}<div class="mt-5">{@render actions()}</div>{/if}
        </div>
        {#if closable}
          <Button variant="ghost" size="icon-xs" class="-mt-0.5 -mr-1 shrink-0 rounded-sm text-[#c5cab7] hover:bg-white/10 hover:text-white" aria-label="Dismiss notification" onclick={dismiss}><X class="size-3.5" /></Button>
        {/if}
      </div>
      </HudFrame>
    </div>
  </HudFrame>
</div>
