<script lang="ts">
  import { hudColorProfile, userPalette } from '$lib/ui/user-colors';
  import { onDestroy, untrack } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { Portal } from 'bits-ui';
  import type { Catalog } from '$lib/config';
  import type { HudSettings } from '$lib/hud-config';
  import HudFrame from './HudFrame.svelte';
  import HudIcon from './HudIcon.svelte';
  import VImage from '../VImage.svelte';
  import { wheelCycle } from './wheel-cycle';

  let { group, selected, anchor, side, settings, inset, layoutKey, reducedMotion = false, clearance = $bindable(0), railClearance = $bindable(0), onhover, oncycle }: {
    group: Catalog['groups'][number]; selected: string; anchor?: HTMLElement;
    side: 'left' | 'right'; settings: HudSettings; inset: number; layoutKey: string;
    reducedMotion?: boolean; clearance?: number; railClearance?: number;
    onhover?: (active: boolean) => void;
    oncycle: (direction: number) => void;
  } = $props();
  onDestroy(() => onhover?.(false));
  let panel = $state<HTMLElement>();
  let focus = $state<HTMLDivElement>();
  let location = $state({ left: 0, top: 0, width: 300, ready: false, above: false });
  let mount = $state({ left: 0, top: 0, width: 0, height: 0 });
  let codes = $derived(group.codes.filter(code => code.active !== false));
  let index = $derived(Math.max(0, codes.findIndex(code => code.id === selected)));
  let previousCount = $derived(Math.min(settings.navigatorNeighbors, Math.floor((codes.length - 1) / 2)));
  let nextCount = $derived(Math.min(settings.navigatorNeighbors, codes.length - 1 - previousCount));
  let radius = $derived(Math.max(0, previousCount, nextCount));
  let identity = $derived(`${group.id}:${codes.map(code => code.id).join(',')}`);
  let cursor = $state(untrack(() => index));
  let previousIndex = untrack(() => index), previousIdentity = untrack(() => identity);
  let motion = $derived(reducedMotion || prefersReducedMotion.current ? 0 : settings.navigatorMotionMs);

  $effect(() => {
    const nextIndex = index, nextIdentity = identity, count = codes.length;
    untrack(() => {
      if (previousIdentity !== nextIdentity) cursor = nextIndex;
      else if (count > 1) {
        let delta = nextIndex - previousIndex;
        if (delta > count / 2) delta -= count;
        if (delta < -count / 2) delta += count;
        cursor += delta;
      }
      previousIndex = nextIndex; previousIdentity = nextIdentity;
    });
  });

  // Unwrapped ordinals keep a step across V010 → V001 moving in the same
  // direction. The extra row at each edge enters behind the viewport mask.
  let rows = $derived.by(() => {
    if (!codes.length) return [];
    return Array.from({ length: previousCount + nextCount + 3 }, (_, slot) => {
      const offset = nextCount + 1 - slot;
      const ordinal = cursor + offset;
      return { ordinal, offset, code: codes[((ordinal % codes.length) + codes.length) % codes.length] };
    });
  });

  $effect(() => {
    if (!panel || !anchor || !focus) return;
    const element = panel, target = anchor, focusWindow = focus;
    const frame = target.closest('.finding-panel') || target;
    const hud = target.closest('.game-hud');
    const rail = target.closest('.arena')?.querySelector('.review-rail');
    const width = settings.navigatorWidthPx, minimum = Math.min(width, settings.navigatorMinWidthPx);
    const gap = settings.navigatorGapPx, edge = inset, preferredSide = side;
    // Position also changes when the desktop rails swap without resizing the HUD.
    layoutKey;
    let raf = 0;
    const measure = () => {
      const bounds = frame.getBoundingClientRect(), aim = target.getBoundingClientRect();
      const box = element.getBoundingClientRect(), center = focusWindow.getBoundingClientRect();
      const room = preferredSide === 'right' ? innerWidth - bounds.right : bounds.left;
      const above = room < minimum + gap + edge;
      const fittedWidth = Math.min(width, above ? bounds.width : room - gap - edge, innerWidth - edge * 2);
      const x = above ? preferredSide === 'right' ? bounds.right - fittedWidth : bounds.left
        : preferredSide === 'right' ? bounds.right + gap : bounds.left - gap - fittedWidth;
      const y = above ? bounds.top - gap - box.height : aim.top + aim.height / 2 - (center.top - box.top + center.height / 2);
      const top = Math.max(edge, Math.min(innerHeight - edge - box.height, y));
      const left = Math.max(edge, Math.min(innerWidth - edge - fittedWidth, x));
      location = { left, top, width: fittedWidth, ready: true, above };
      // Seat the existing grill bracket into both frames. When the list docks
      // above the weapon, turn the same hardware across the vertical join.
      const join = above ? bounds.top - top - box.height
        : preferredSide === 'right' ? left - bounds.right : bounds.left - left - fittedWidth;
      const overlapStart = above ? Math.max(left, bounds.left) : Math.max(top, bounds.top);
      const overlapEnd = above ? Math.min(left + fittedWidth, bounds.right) : Math.min(top + box.height, bounds.bottom);
      const mountWidth = Math.max(0, join) + 36, mountHeight = Math.min(76, Math.max(0, overlapEnd - overlapStart));
      const mountX = above ? (overlapStart + overlapEnd) / 2
        : preferredSide === 'right' ? (bounds.right + left) / 2 : (left + fittedWidth + bounds.left) / 2;
      const mountY = above ? (top + box.height + bounds.top) / 2 : (overlapStart + overlapEnd) / 2;
      mount = { left: mountX - left - mountWidth / 2, top: mountY - top - mountHeight / 2,
        width: join >= 0 ? mountWidth : 0, height: mountHeight };
      clearance = innerHeight - top;
      const railBounds = rail?.getBoundingClientRect();
      // Reserve the occupied part of the explorer so its last files can still
      // scroll into view above this panel, including when the rails are swapped.
      railClearance = railBounds && left < railBounds.right && left + fittedWidth > railBounds.left ? clearance + gap : 0;
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element); observer.observe(target); observer.observe(frame);
    if (hud) observer.observe(hud);
    window.addEventListener('resize', schedule);
    schedule();
    return () => { observer.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('resize', schedule); };
  });
</script>

<Portal>
  <aside class="vcode-navigator pointer-events-auto fixed z-90 drop-shadow-[0_7px_12px_#0008] data-[ready=false]:invisible" bind:this={panel} data-cursor="native" data-side={side} data-dock={location.above ? 'above' : side} data-ready={location.ready}
    use:wheelCycle={oncycle}
    onpointerenter={() => onhover?.(true)} onpointerleave={() => onhover?.(false)}
    aria-label={`${side === 'right' ? 'Primary' : 'Secondary'} V-code navigator`} style:left={`${location.left}px`} style:top={`${location.top}px`} style:width={`${location.width}px`}
    style:--navigator-color={userPalette(group.color, hudColorProfile).foreground} style:--navigator-duration={`${motion}ms`} style:--navigator-radius={radius}
    style:--navigator-row-height={`min(${settings.navigatorRowHeightPx}px, calc((100dvh - ${inset * 2 + 62}px) / ${radius * 2 + 1}))`}
    style:--navigator-icon-size={`${Math.min(settings.iconSize, settings.navigatorRowHeightPx * .65)}px`}
    style:--navigator-code-size={`${Math.min(settings.vcodeSize * .65, settings.navigatorRowHeightPx * .58)}px`}
    style:--navigator-title-size={`${settings.titleSize}px`}>
    {#if location.ready && mount.width > 0 && mount.height > 0}
      <div class="navigator-mount pointer-events-none absolute -z-1" aria-hidden="true"
        style:left={`${mount.left}px`} style:top={`${mount.top}px`} style:width={`${mount.width}px`} style:height={`${mount.height}px`}
        style:transform={location.above ? 'rotate(90deg)' : undefined}>
        <HudFrame variant="bracket" mirrored={side === 'left'} />
      </div>
    {/if}
    <HudFrame mirrored={side === 'left'}>
      <div class="px-3 pt-4 pb-3">
        <header class="mb-[3px] flex h-[26px] items-center justify-between gap-3 bg-(--tint-050b07b3) px-[9px] shadow-[inset_0_2px_3px_#0008,0_1px_var(--tint-b8b39330)]"><span class="relative top-px truncate font-(family-name:--hud-font) text-[15px]/none font-[750] tracking-[.02em] text-(--navigator-color) uppercase">{group.name}</span><small class="flex gap-[5px] font-mono text-[11px]/none text-(--tint-b5bbaa) tabular-nums">{String(index + 1).padStart(2, '0')}<i class="text-(--tint-727c70) not-italic">/</i>{String(codes.length).padStart(2, '0')}</small></header>
        <div class="navigator-viewport relative h-[calc((var(--navigator-radius)*2+1)*var(--navigator-row-height))] overflow-hidden bg-linear-to-b from-(--tint-07100bbb) to-(--tint-070d09d9) mask-[linear-gradient(transparent,#000_5%,#000_95%,transparent)]">
          <div class="navigator-focus absolute top-1/2 left-0 h-(--navigator-row-height) w-full -translate-y-1/2" bind:this={focus}><HudFrame variant="inset" /><span class={['absolute inset-y-1/4 w-0.5 bg-(--navigator-color) shadow-[0_0_7px] shadow-(--navigator-color)/65', side === 'left' ? 'right-1' : 'left-1']}></span></div>
          {#key identity}
            <div role="list" aria-label="Upcoming and previous V-codes">
              {#each rows as row (row.ordinal)}
                {@const visible = row.offset <= nextCount && row.offset >= -previousCount}
                <div class="navigator-row group/row absolute inset-x-0 top-1/2 -mt-[calc(var(--navigator-row-height)/2)] grid h-(--navigator-row-height) grid-cols-[var(--navigator-icon-size)_auto_minmax(0,1fr)] items-center gap-2 px-2.5 transition-[transform,opacity] duration-(--navigator-duration) [transition-timing-function:cubic-bezier(.22,.68,.16,1),ease-out]" class:current={row.offset === 0} role="listitem" aria-current={row.offset === 0 ? 'true' : undefined}
                  aria-hidden={!visible} aria-label={`${row.code.id} ${row.code.title}`} data-code={row.code.id} data-offset={row.offset}
                  style:transform={`translateY(calc(${-row.offset} * var(--navigator-row-height)))`}
                  style:opacity={visible ? 1 - (1 - settings.navigatorFarOpacity) * Math.abs(row.offset) / Math.max(1, radius) : 0}>
                  <span class="grid size-(--navigator-icon-size) place-items-center leading-none text-(--navigator-color) [&_span]:size-full! [&_svg]:size-full!">
                    {#if settings.iconStyle === 'catalog'}<VImage index={row.code.image} size={settings.iconSize} />{:else}<HudIcon name={settings.iconStyle} />{/if}
                  </span>
                  <strong class="relative top-[.09em] font-(family-name:--hud-font) text-(length:--navigator-code-size)/none font-bold text-(--navigator-color) tabular-nums group-aria-current/row:text-shadow-[0_0_12px] group-aria-current/row:text-shadow-(--navigator-color)/28">{row.code.id}</strong><span class="navigator-title min-w-0 truncate font-sans text-(length:--navigator-title-size)/[1.2] font-[450] text-(--tint-cbd1c3) group-aria-current/row:font-semibold group-aria-current/row:text-(--tint-f0f0e3)" title={row.code.title}>{row.code.title}</span>
                </div>
              {/each}
            </div>
          {/key}
        </div>
      </div>
    </HudFrame>
  </aside>
</Portal>
