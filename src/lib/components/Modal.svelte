<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import { untrack, type Snippet } from 'svelte';
  import { X } from '@lucide/svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import Hint from './Hint.svelte';
  let { title, eyebrow, onclose, oncancel, children, guidance, headerActions, closeLabel = 'Close dialog', size, wide = false, drawer = false, floating = false, cinematic = false, fixedHeight = false, layoutKey }: { title: string; eyebrow?: string; onclose: () => void; oncancel?: () => void; children: Snippet; guidance?: Snippet; headerActions?: Snippet; closeLabel?: string; size?: 'md' | 'lg' | 'xl'; wide?: boolean; drawer?: boolean; floating?: boolean; cinematic?: boolean; fixedHeight?: boolean; layoutKey?: string } = $props();
  let open = $state(true);
  let content = $state<HTMLElement | null>(null);
  const returnFocus = untrack(() => typeof document === 'undefined' ? null : document.activeElement);
  let Title = $derived(drawer ? Sheet.Title : Dialog.Title);
  let movable = $derived(!drawer && !!layoutKey);

  function changed(value: boolean) { if (!value) onclose(); }
  function escape(event: KeyboardEvent) { if (oncancel) { event.preventDefault(); oncancel(); } }
  function focusContent(event: Event) {
    event.preventDefault();
    // Keep initial focus away from the close button's tooltip. Comment dialogs
    // still open ready to type; other dialogs announce their title first.
    (content?.querySelector<HTMLElement>('[autofocus], textarea') || content)?.focus({ preventScroll: true });
  }
  function restoreFocus(event: Event) {
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) { event.preventDefault(); returnFocus.focus({ preventScroll: true }); }
  }
</script>

{#snippet body()}
  <header class="modal-grip data-panel-drag:touch-none data-panel-drag:select-none flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card/40 px-6 py-5" data-panel-drag={movable ? '' : undefined}
    role="toolbar" aria-label={movable ? `Move ${title}: drag or use arrow keys` : title} tabindex={movable ? 0 : undefined}>
    <div class="min-w-0">
      {#if eyebrow}<p class="mb-1 text-xs text-muted-foreground">{eyebrow}</p>{/if}
      <Title class="text-2xl font-semibold tracking-tight">{title}</Title>
    </div>
    <div class="flex shrink-0 items-center gap-4">
      {#if headerActions}{@render headerActions()}{/if}
      <Hint text={closeLabel}>
        {#snippet children({ props })}<Button {...mergeProps(props, { onclick: onclose })} variant="ghost" size="icon" aria-label={closeLabel}><X /></Button>{/snippet}
      </Hint>
    </div>
  </header>
  {#if guidance}{@render guidance()}{/if}
  <div class={["min-h-0 min-w-0 flex-1", floating || drawer ? "flex flex-col overflow-hidden" : "overflow-y-auto"]}>
    {@render children()}
  </div>
{/snippet}

{#if drawer}
  <Sheet.Root bind:open onOpenChange={changed}>
    <Sheet.Content bind:ref={content} side="right" showCloseButton={false} aria-describedby={undefined} onOpenAutoFocus={focusContent} onEscapeKeydown={escape} onCloseAutoFocus={restoreFocus}
      variant="inset">
      {@render body()}
    </Sheet.Content>
  </Sheet.Root>
{:else}
  <Dialog.Root bind:open onOpenChange={changed} pauseGameplay={!floating}>
    <Dialog.Content bind:ref={content} modal={!floating} showCloseButton={false} aria-describedby={undefined} onOpenAutoFocus={focusContent} onEscapeKeydown={escape} onCloseAutoFocus={restoreFocus}
      interactOutsideBehavior={floating ? 'ignore' : 'close'}
      {layoutKey} {cinematic}
      variant="panel" size={size ?? (wide ? 'lg' : 'md')} {fixedHeight}>
      {@render body()}
    </Dialog.Content>
  </Dialog.Root>
{/if}
