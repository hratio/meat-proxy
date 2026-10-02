<script lang="ts">
  import { onDestroy } from 'svelte';
  import { on } from 'svelte/events';
  import type { Catalog, Config } from '$lib/config';
  import type { Finding } from '$lib/types';
  import { rangeLabel } from '$lib/location';
  import VImage from './VImage.svelte';
  import FindingDetails from './FindingDetails.svelte';
  import { Check, MessageSquareCheck } from '@lucide/svelte';
  import { useUi } from '$lib/ui/context.svelte';
  import { userPalette } from '$lib/ui/user-colors';
  import * as Popover from '$lib/components/ui/popover';

  let { finding, catalog, config, size, color, previewOpen = false, pinned = false, inspectionActive = false, detailAnchor, onpreviewchange, oninspect, onresolve, onreopen, ondelete, onhistory, isCurrentRevision = () => false, onhover }: {
    finding: Finding; catalog: Catalog; config: Config; size: number; color: string;
    previewOpen?: boolean; pinned?: boolean; inspectionActive?: boolean;
    detailAnchor?: HTMLElement;
    onpreviewchange: (open: boolean) => void;
    oninspect: (open: boolean) => void; onresolve: (id: string) => void; onreopen: (id: string) => void; ondelete: (id: string) => void;
    onhistory?: (finding: Finding) => void; isCurrentRevision?: (finding: Finding) => boolean; onhover?: (hovered: boolean) => void;
  } = $props();
  const ui = useUi();
  let palette = $derived(userPalette(color, ui.colors));
  let catalogRule = $derived(catalog.groups.flatMap(group => group.codes).find(rule => rule.id === finding.code));
  let rule = $derived(finding.code ? finding.rule || catalogRule : undefined);
  let image = $derived(catalogRule?.image ?? finding.rule?.image ?? 0);
  let open = $derived(pinned || (previewOpen && !inspectionActive));
  let trigger = $state<HTMLButtonElement | null>(null);
  let content = $state<HTMLElement | null>(null);
  let restoreFocus = false;

  function changeOpen(next: boolean) {
    if (next && inspectionActive && !pinned) return;
    onpreviewchange(next);
    if (!next && pinned) oninspect(false);
  }
  function close(focus = false) { restoreFocus = focus; changeOpen(false); }
  function inspectAfterToggle() {
    const wasPinned = pinned;
    // Let Popover.Trigger complete its native click/keyboard toggle first.
    // Explicit selection also switches away from another pinned finding.
    queueMicrotask(() => { if (!wasPinned) oninspect(true); });
  }
  $effect(() => {
    if (!open || pinned) return;
    const scroll = on(window, 'scroll', event => {
      if (!(event.target instanceof Node) || !content?.contains(event.target)) close();
    }, { capture: true, passive: true });
    const resize = on(window, 'resize', () => close());
    return () => { scroll(); resize(); };
  });
  onDestroy(() => { if (previewOpen) onpreviewchange(false); });
</script>

<Popover.Root bind:open={() => open, changeOpen} pauseCombat={pinned} pauseWeaponTracking={pinned}>
  <!-- Totems also accept held erase triggers; opt out of the popover's native-only pointer handling. -->
  <Popover.Trigger bind:ref={trigger} openOnHover={!inspectionActive} openDelay={config.display.tooltipDelayMs} closeDelay={Math.max(300, config.display.tooltipDelayMs + 50)}
    class={['range-badge pointer-events-auto relative grid size-(--badge-size) flex-none place-items-center rounded border p-0 font-mono text-[length:calc(var(--badge-size)/3)]/none font-bold [&>*]:pointer-events-none', finding.status === 'resolved' ? 'resolved border-success/40 bg-card/80 text-success shadow-none' : 'border-(--mark-color) bg-(--mark-background) text-(--mark-color) shadow-[0_1px_6px_#0006] hover:bg-(--mark-color) hover:text-(--mark-foreground) data-[pinned=true]:bg-(--mark-color) data-[pinned=true]:text-(--mark-foreground) focus-visible:bg-(--mark-color) focus-visible:text-(--mark-foreground)']}
    data-finding-id={finding.id} data-pinned={pinned} data-cursor={undefined}
    style={`--badge-size: ${size}px; --mark-color: ${palette.foreground}; --mark-background: ${palette.background}; --mark-foreground: ${palette.onSolid}`}
    aria-label={`${finding.code || 'Comment'} ${finding.ranges ? 'lines ' : ''}${rangeLabel(finding)}`}
    onpointerenter={event => { if (event.pointerType !== 'touch' && !event.buttons) onhover?.(true); }}
    onpointerleave={() => onhover?.(false)} onfocus={() => onhover?.(true)} onblur={() => onhover?.(false)}
    onclick={inspectAfterToggle} onkeydown={event => { if (event.key === 'Enter' || event.key === ' ') inspectAfterToggle(); }}
    oncontextmenu={event => { event.preventDefault(); close(); ondelete(finding.id); }}>
    {#if finding.status === 'resolved'}
      {#if finding.resolution}<MessageSquareCheck size={size * .66} />{:else}<Check size={size * .7} />{/if}
    {:else if finding.code && config.display.weaponDisplay === 'image'}
      <VImage index={image} size={size - 2} />
    {:else}<span>{finding.code || '//'}</span>{/if}
  </Popover.Trigger>
  <FindingDetails bind:content {finding} {rule} {color} {pinned} anchor={detailAnchor}
    onescape={() => restoreFocus = pinned} oncloseautofocus={event => { event.preventDefault(); if (restoreFocus) trigger?.focus({ preventScroll: true }); restoreFocus = false; }}
    oninteract={() => oninspect(true)} {onhover} {onresolve} {onreopen} {ondelete} {onhistory} {isCurrentRevision} onclose={close} />
</Popover.Root>
