<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { X } from '@lucide/svelte';
  import type { Catalog } from '$lib/config';
  import type { Aim } from '$lib/types';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import VImage from './VImage.svelte';

  let { groups, position, selection, selectionMode = 'single', layout = 'rows', showIcons = true, hoverPadding = 32, closeDelay = 300, onselect, onclose }: {
    groups: Catalog['groups']; position: { x: number; y: number };
    selection: { from: Aim; aim: Aim };
    selectionMode?: 'single' | 'multiple'; layout?: 'rows' | 'compact'; showIcons?: boolean;
    hoverPadding?: number; closeDelay?: number;
    onselect: (code: string) => void; onclose: () => void;
  } = $props();

  const gridId = $props.id();
  const diameter = 280;
  const anchor = { getBoundingClientRect: () => new DOMRect(position.x, position.y, 0, 0) };
  let wheel = $state<HTMLDivElement | null>(null);
  let grid = $state<HTMLDivElement | null>(null);
  let activeId = $state<string>();
  let activeIndex = $derived(groups.findIndex(group => group.id === activeId));
  let group = $derived(groups[activeIndex]);
  let gridSide = $derived(polar(activeIndex, 1).x < 50 ? 'left' as const : 'right' as const);
  let lines = $derived(!selection.from.line || !selection.aim.line ? 'Whole file' : selection.from.side === selection.aim.side
    ? `L${Math.min(selection.from.line!, selection.aim.line!)}${selection.from.line === selection.aim.line ? '' : `–${Math.max(selection.from.line!, selection.aim.line!)}`}`
    : `old ${selection.from.side === 'deletions' ? selection.from.line : selection.aim.line} · new ${selection.from.side === 'additions' ? selection.from.line : selection.aim.line}`);

  function polar(index: number, radius: number) {
    const angle = -Math.PI / 2 + (index + .5) * Math.PI * 2 / groups.length;
    return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
  }
  function sector(index: number) {
    const step = Math.PI * 2 / groups.length;
    const start = -Math.PI / 2 + index * step + .009;
    const end = start + step - .018;
    const points = Array.from({ length: 49 }, (_, i) => {
      const angle = start + (end - start) * i / 48;
      return `${50 + Math.cos(angle) * 50}% ${50 + Math.sin(angle) * 50}%`;
    });
    return `polygon(50% 50%, ${points.join(', ')})`;
  }

  function nearSurface(element: HTMLElement | null, event: PointerEvent) {
    if (!element) return false;
    const bounds = element.getBoundingClientRect();
    return event.clientX >= bounds.left - hoverPadding && event.clientX <= bounds.right + hoverPadding
      && event.clientY >= bounds.top - hoverPadding && event.clientY <= bounds.bottom + hoverPadding;
  }

  // Keep the two portaled surfaces and their surrounding margin in one hover
  // region. Bits exposes a hover-trigger delay, but no public grace padding.
  onMount(() => {
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    const move = (event: PointerEvent) => {
      if (nearSurface(wheel, event) || nearSurface(grid, event)) {
        clearTimeout(leaveTimer); leaveTimer = undefined;
      } else if (!leaveTimer) leaveTimer = setTimeout(onclose, closeDelay);
    };
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) onclose(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerout', leave);
    return () => { clearTimeout(leaveTimer); window.removeEventListener('pointermove', move); window.removeEventListener('pointerout', leave); };
  });

  function keepWheelInteraction(event: Event) {
    if (event.target instanceof Node && wheel?.contains(event.target)) event.preventDefault();
  }

  function selectCode(code: string) {
    onselect(code);
    if (selectionMode === 'single') onclose();
  }
  async function enterGroup(id: string) {
    activeId = id;
    await tick();
    grid?.querySelector<HTMLElement>('.violation-code')?.focus({ preventScroll: true });
  }
</script>

<Popover.Root open={true} onOpenChange={open => { if (!open) onclose(); }}>
  <Popover.Content bind:ref={wheel} customAnchor={anchor} side="bottom" sideOffset={-diameter / 2} collisionPadding={12}
    aria-label="Choose violation group" data-violation-wheel
    class="relative block size-[280px] rounded-full border border-border bg-popover p-1 shadow-xl ring-0 select-none data-open:animate-none data-closed:animate-none"
    onOpenAutoFocus={event => { event.preventDefault(); wheel?.focus({ preventScroll: true }); }} onCloseAutoFocus={event => event.preventDefault()}>
    <div class="relative size-full overflow-hidden rounded-full bg-border">
      {#each groups as item, index (item.id)}
        {@const label = polar(index, 34)}
        <button type="button" class="wheel-sector" class:active={group?.id === item.id}
          style:clip-path={sector(index)} style:--group-color={item.color}
          aria-label={item.name} aria-haspopup="dialog" aria-expanded={group?.id === item.id} aria-controls={group?.id === item.id ? gridId : undefined}
          onpointerenter={() => activeId = item.id} onfocus={() => activeId = item.id} onclick={event => { if (event.detail === 0) void enterGroup(item.id); else activeId = item.id; }}>
          <span class="sector-label" style:left={`${label.x}%`} style:top={`${label.y}%`}>
            <span class="text-[10px] font-semibold leading-tight">{item.name}</span>
          </span>
        </button>
      {/each}
      <button type="button" class="wheel-hub" aria-label={`Close selection ${lines}`}
        onpointerenter={() => activeId = undefined} onfocus={() => activeId = undefined} onclick={onclose}>
        <strong class="text-sm leading-tight">{lines}</strong>
      </button>
    </div>
    <Popover.Root open={!!group} onOpenChange={open => { if (!open) onclose(); }}>
      <Popover.Content bind:ref={grid} id={gridId} customAnchor={wheel} side={gridSide} align="center" sideOffset={8} collisionPadding={12}
        aria-label={group ? `${group.name} violations` : 'Violation codes'} data-violation-grid
        class="w-[400px] max-w-[calc(100vw-24px)] gap-0 overflow-hidden border border-border p-0 shadow-xl ring-0 select-none data-open:animate-none data-closed:animate-none"
        onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
        onInteractOutside={keepWheelInteraction} onFocusOutside={keepWheelInteraction}>
        {#if group}
          <header class="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
            <span class="size-2.5 shrink-0 rounded-full" style:background={group.color}></span>
            <h2 class="min-w-0 flex-1 text-sm font-semibold">{group.name}</h2>
            <Button variant="ghost" size="icon-sm" aria-label="Cancel selection" onclick={onclose}><X size={14} /></Button>
          </header>
          {#key group.id}
            <ScrollArea type="auto" class="min-w-0 [&>[data-slot=scroll-area-viewport]]:max-h-[min(360px,calc(100dvh-100px))]">
              <div class="violation-codes" class:compact={layout === 'compact'} class:with-icons={showIcons} style:--group-color={group.color}>
                {#each group.codes as code (code.id)}
                  <button type="button" class="violation-code" aria-label={`${code.id}: ${code.title}`} onclick={() => selectCode(code.id)}>
                    {#if showIcons}<VImage index={code.image} size={layout === 'compact' ? 32 : 24} />{/if}
                    <strong class="font-mono text-[11px]">{code.id}</strong>
                    <span class={layout === 'compact' ? 'line-clamp-2 text-[10px] leading-snug' : 'min-w-0 text-xs leading-snug'}>{code.title}</span>
                  </button>
                {/each}
              </div>
            </ScrollArea>
          {/key}
        {/if}
      </Popover.Content>
    </Popover.Root>
  </Popover.Content>
</Popover.Root>

<style>
  .wheel-sector {
    position: absolute;
    inset: 0;
    cursor: pointer;
    color: var(--foreground);
    background: color-mix(in srgb, var(--group-color) 32%, var(--popover));
    transition: background 100ms;
    outline: none;
  }
  .wheel-sector.active, .wheel-sector:focus-visible {
    background: color-mix(in srgb, var(--group-color) 72%, var(--popover));
  }
  .sector-label {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 76px;
    transform: translate(-50%, -50%);
    overflow-wrap: anywhere;
    pointer-events: none;
  }
  .wheel-hub {
    position: absolute;
    inset: 33%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--popover);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--popover) 70%, transparent);
    text-align: center;
    cursor: pointer;
  }
  .wheel-hub:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -4px;
  }
  .violation-codes {
    --violation-columns: 3.5rem minmax(0, 1fr);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    padding: 8px;
  }
  .violation-codes.with-icons {
    --violation-columns: 1.75rem 3.5rem minmax(0, 1fr);
  }
  .violation-code {
    display: grid;
    grid-template-columns: var(--violation-columns);
    min-height: 42px;
    min-width: 0;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 9px;
    cursor: pointer;
    text-align: left;
    background: color-mix(in srgb, var(--group-color) 6%, var(--popover));
  }
  .violation-codes.compact {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .compact .violation-code {
    display: flex;
    min-height: 102px;
    flex-direction: column;
    gap: 5px;
    padding: 9px 5px;
    text-align: center;
  }
  .violation-code:hover, .violation-code:focus-visible {
    border-color: var(--group-color);
    background: color-mix(in srgb, var(--group-color) 22%, var(--popover));
    outline: none;
  }
</style>
