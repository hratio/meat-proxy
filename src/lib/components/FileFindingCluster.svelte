<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Catalog, Config } from '$lib/config';
  import type { Finding } from '$lib/types';
  import { themeColors } from '$lib/ui/theme';
  import FindingBadge from './FindingBadge.svelte';

  let { inline = false, sizes, path, findings, catalog, config, size, inspected, inspectionActive, onhover, oninspect, onresolve, onreopen, ondelete, onhistory, isCurrentRevision = () => false, onexpanded }: {
    inline?: boolean; sizes?: Map<string, number>; path: string; findings: Finding[]; catalog: Catalog; config: Config; size: number;
    inspected?: string; inspectionActive: boolean;
    onhover: (id: string, hovered: boolean) => void; oninspect: (id: string, open: boolean) => void;
    onresolve: (id: string) => void; onreopen: (id: string) => void; ondelete: (id: string) => void; onhistory: (finding: Finding) => void; isCurrentRevision?: (finding: Finding) => boolean;
    onexpanded: (expanded: boolean) => void;
  } = $props();
  const panelId = $props.id();
  let group: HTMLDivElement;
  let panel = $state<HTMLDivElement>();
  let previewed = $state<string>();
  $effect(() => { if (inspectionActive) previewed = undefined; });
  let expanded = $state(false), maxHeight = $state(600);
  let pointerInside = false, focusInside = false;
  let closing: ReturnType<typeof setTimeout> | undefined;
  let detailsOpen = $derived(!!previewed || !!inspected);
  // Reverse the stable source order for equal timestamps as well, so a newly
  // appended finding always appears at the front of the collapsed group.
  const ordered = $derived([...findings].reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  // Line clusters show up to four equal-size previews. Expansion restores
  // each finding's range size; a standalone multiline finding stays large.
  const compactLines = $derived(inline && findings.length > 1);
  const limit = 4;
  const overflow = $derived(findings.length > limit);
  const expandable = $derived(overflow || (compactLines && ordered.some(finding => (sizes?.get(finding.id) || size) > size)));
  const columns = $derived(Math.max(1, Math.min(findings.length, 2)));
  const compactWidth = $derived(columns * size + (columns - 1) * config.display.badgeGap);
  const width = $derived(compactLines && !expanded ? compactWidth : Math.max(compactWidth, ...Array.from(sizes?.values() || [])));
  const rows = $derived(Math.ceil(Math.min(findings.length, limit) / columns));
  const height = $derived(inline && findings.length === 1 ? sizes?.get(ordered[0].id) || size : rows * size + Math.max(0, rows - 1) * config.display.badgeGap);
  function badgeSize(id: string) { return compactLines && !expanded ? size : sizes?.get(id) || size; }
  const fullHeight = $derived.by(() => {
    let height = 0, small = 0;
    for (const finding of ordered) {
      const itemSize = sizes?.get(finding.id) || size;
      if (itemSize > size) {
        if (small) { height += size + config.display.badgeGap; small = 0; }
        height += itemSize + config.display.badgeGap;
      } else if (++small === columns) { height += size + config.display.badgeGap; small = 0; }
    }
    return height + (small ? size : -config.display.badgeGap);
  });
  const scrolling = $derived(expanded && fullHeight > maxHeight);
  const visible = $derived(expanded ? ordered : ordered.slice(0, limit));

  function open() {
    clearTimeout(closing);
    if (!expandable || expanded) return;
    const viewport = window.visualViewport;
    maxHeight = Math.max(height, (viewport ? viewport.offsetTop + viewport.height : innerHeight) - group.getBoundingClientRect().top - 12);
    expanded = true;
  }
  function collapse() { clearTimeout(closing); expanded = false; }
  function leave() {
    clearTimeout(closing);
    closing = setTimeout(() => { if (!pointerInside && !focusInside && !detailsOpen) collapse(); }, 220);
  }
  function preview(id: string, open: boolean) {
    if (open) previewed = id;
    else if (previewed === id) previewed = undefined;
  }
  $effect(() => {
    if (detailsOpen) clearTimeout(closing);
    else if (!pointerInside && !focusInside) leave();
  });
  $effect(() => {
    const value = expanded && expandable;
    untrack(() => { if (!expandable) collapse(); onexpanded(value); });
  });
  onMount(() => {
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !group.contains(event.target)) {
        if (!detailsOpen) collapse();
      }
    };
    const resize = () => { if (!detailsOpen) collapse(); };
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => { clearTimeout(closing); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); onexpanded(false); };
  });
</script>

<!-- Include the header's 1px border so file and line badges share the same gap. -->
<div class={[inline ? 'line-badges relative' : 'file-badges absolute -top-px', expanded ? 'z-40' : 'z-20', inline ? '' : config.display.sidebarLeft ? 'left-[calc(100%+1px+var(--file-badge-padding))]' : 'right-[calc(100%+1px+var(--file-badge-padding))]']}
  bind:this={group} style:width={`${width}px`} style:height={`${height}px`} data-expanded={expanded} data-ui-control role="group" aria-label={`Findings for ${path}`}
  onpointerenter={event => { if (event.pointerType === 'touch' || event.buttons) return; pointerInside = true; open(); }}
  onpointerleave={() => { pointerInside = false; leave(); }}
  onfocusin={() => { focusInside = group.contains(document.activeElement); if (focusInside) open(); }}
  onfocusout={event => { focusInside = event.relatedTarget instanceof Node && group.contains(event.relatedTarget); if (!focusInside) leave(); }}>
  <!-- A standalone range needs a full-width grid column, including in RTL layout. -->
  <div bind:this={panel} id={panelId} data-file-badge-panel class={['absolute top-0 grid items-start gap-(--badge-gap) grid-cols-[repeat(var(--badge-columns),var(--badge-column-size))]', config.display.sidebarLeft ? 'left-0 [direction:ltr]' : 'right-0 [direction:rtl]', expanded && 'rounded bg-popover shadow-lg ring-1 ring-border', scrolling && 'overflow-y-auto overscroll-contain [scrollbar-width:thin]']}
    style:--badge-gap={`${config.display.badgeGap}px`} style:--badge-column-size={`${columns === 1 ? width : size}px`} style:--badge-columns={columns}
    style:width={`${width + (scrolling ? 12 : 0)}px`} style:max-height={expanded ? `${maxHeight}px` : undefined}>
    {#each visible as finding (finding.id)}
      <div class={['isolate flex [direction:ltr]', finding.status === 'resolved' && 'opacity-75']} class:resolved={finding.status === 'resolved'} style:grid-column={badgeSize(finding.id) > size ? '1 / -1' : undefined}>
        <FindingBadge {catalog} {finding} {config} size={badgeSize(finding.id)} color={catalog.groups.find(group => group.codes.some(code => code.id === finding.code))?.color || themeColors.annotation}
          previewOpen={previewed === finding.id} pinned={inspected === finding.id} {inspectionActive}
          detailAnchor={expanded ? panel : undefined}
          onpreviewchange={open => preview(finding.id, open)} oninspect={open => oninspect(finding.id, open)} onhover={hovered => onhover(finding.id, hovered)}
          {onresolve} {onreopen} {ondelete} {onhistory} {isCurrentRevision} />
      </div>
    {/each}
  </div>
  {#if overflow && !expanded}
    <button type="button" class="file-badges-more pointer-events-auto absolute -end-1 -bottom-1 grid size-4 place-items-center rounded border border-border bg-popover font-mono text-[14px]/none font-bold text-foreground" aria-label={`Show all ${findings.length} findings for ${path}`} aria-expanded={expanded} aria-controls={panelId} onclick={open}>
      <span role="img" aria-label={`${findings.length - limit} more findings`}>+</span>
    </button>
  {/if}
</div>
