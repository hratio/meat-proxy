<script lang="ts">
  import { X } from '@lucide/svelte';
  import type { Finding } from '$lib/types';
  import type { Rule } from '$lib/config';
  import { rangeLabel } from '$lib/location';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import CodeExample from './hud/CodeExample.svelte';
  import { useUi } from '$lib/ui/context.svelte';
  import { userPalette } from '$lib/ui/user-colors';

  let { content = $bindable(null), finding, rule, color, anchor, pinned, onescape, oncloseautofocus, oninteract, onhover, onclose, onresolve, onreopen, ondelete, onhistory, isCurrentRevision = () => false }: {
    content?: HTMLElement | null; finding: Finding; rule?: Rule; color: string;
    anchor?: HTMLElement; pinned: boolean;
    onescape: () => void; oncloseautofocus: (event: Event) => void; oninteract: () => void;
    onhover?: (hovered: boolean) => void; onclose: (restoreFocus?: boolean) => void;
    onresolve: (id: string) => void; onreopen: (id: string) => void; ondelete: (id: string) => void; onhistory?: (finding: Finding) => void; isCurrentRevision?: (finding: Finding) => boolean;
  } = $props();
  const id = $props.id();
  const ui = useUi();
</script>

<Popover.Content variant="panel" {id} bind:ref={content} customAnchor={anchor} side="bottom" align="start" sideOffset={12} alignOffset={12}
  strategy="fixed" sticky="always" collisionPadding={12} trapFocus={pinned} preventScroll={false} preventOverflowTextSelection={false}
  onCloseAutoFocus={oncloseautofocus} onEscapeKeydown={onescape}
  onpointerenter={() => onhover?.(true)} onpointerleave={() => onhover?.(false)}
  onpointerdown={oninteract} onfocusin={event => { if (event.target !== content) oninteract(); }}
  aria-label={`${finding.code || 'Comment'} finding details`} aria-describedby={rule ? `${id}-description` : undefined} data-pinned={pinned}
  class={['finding-details max-h-[calc(100dvh-24px)] gap-2.5 overflow-y-auto p-3.5 shadow-xl', rule?.bad?.trim()
    ? 'w-max min-w-[min(340px,calc(100vw-24px))] max-w-[min(432px,calc(100vw-24px))]'
    : 'w-[340px] max-w-[calc(100vw-24px)]']}>
    <header class="flex shrink-0 items-start gap-2" style:--vcode-color={userPalette(color, ui.colors).foreground}>
      <div class="flex min-w-0 flex-1 items-baseline gap-[9px]">
        <span class="flex-none font-mono text-[12px]/5 font-semibold text-(--vcode-color)">{finding.code || 'Comment'}</span>
        <h3 class="m-0 line-clamp-2 font-sans text-[14px]/5 font-semibold wrap-anywhere text-foreground">{rule?.title || rangeLabel(finding)}</h3>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Close finding" onclick={() => onclose(true)}><X /></Button>
    </header>
    {#if rule}
      <p id={`${id}-description`} class="description m-0 line-clamp-3 shrink-0 font-sans text-[12px]/4.5 wrap-anywhere whitespace-pre-line text-muted-foreground">{rule.description}</p>
      {#if rule.bad?.trim()}
        <div class="preview-example shrink-0 overflow-hidden rounded border border-border bg-[var(--hud-well,#0a1110)] py-1.5 [--hud-code-size:12px] [&_.example-scroll]:max-h-[93px] [&_pre]:py-0"><CodeExample code={rule.bad} label={`${rule.id} bad example`} /></div>
      {/if}
    {/if}
    {#if finding.comment}<p class="finding-note m-0 max-h-[90px] shrink-0 overflow-auto font-sans text-[12px]/4.5 whitespace-pre-wrap">{finding.comment}</p>{/if}
    {#if finding.status === 'resolved'}<p class="finding-note m-0 max-h-[90px] shrink-0 overflow-auto border-l-2 border-(--green) pl-2.5 font-sans text-[12px]/4.5 whitespace-pre-wrap text-(--green)">{finding.resolution || 'Resolved'}</p>{/if}
    <footer class="mt-auto flex shrink-0 flex-wrap gap-2">
      {#if onhistory && finding.version}<Button variant="outline" size="sm" disabled={isCurrentRevision(finding)} onclick={() => { onhistory?.(finding); onclose(); }}>{isCurrentRevision(finding) ? 'Current revision' : 'View revision'}</Button>{/if}
      <Button variant="secondary" size="sm" onclick={() => { finding.status === 'open' ? onresolve(finding.id) : onreopen(finding.id); onclose(); }}>{finding.status === 'open' ? 'Resolve' : 'Reopen'}</Button>
      <Button variant="destructive" size="sm" onclick={() => { ondelete(finding.id); onclose(); }}>Delete</Button>
    </footer>
  </Popover.Content>
