<script lang="ts">
  import { reviewFetch as fetch } from '$review-client';
  import { getAllContexts, mount, onMount, unmount, untrack, type ComponentProps } from 'svelte';
  import { VirtualizedFileDiff, type Virtualizer, type FileDiffMetadata, type FileDiffOptions, type DiffLineAnnotation } from '@pierre/diffs';
  import { getOrCreateWorkerPoolSingleton, type WorkerPoolManager } from '@pierre/diffs/worker';
  import WorkerUrl from '@pierre/diffs/worker/worker.js?worker&url';
  import type { Aim, DiffContents, DiffFile, DiffLineCounts, Finding } from '$lib/types';
  import type { Catalog, Config } from '$lib/config';
  import type { DiffRow } from '$lib/location';
  import type { DiffCache } from '$lib/diff-cache';
  import { DiffMarkIndex } from '$lib/diff-mark-index';
  import diffStyles from '$lib/styles/diff-overrides.css?inline';
  import FileFindingCluster from './FileFindingCluster.svelte';
  import CommentAnnotation from './CommentAnnotation.svelte';
  import { formatHex, interpolate } from 'culori';
  import { colorOpacityPercent, colorProfile, darkColorProfile, lightColorProfile, readColorVariables, userPalette, withColorOpacity } from '$lib/ui/user-colors';
  import { groupFindingMarkers } from '$lib/ui/finding-marker-layout';
  import { useDestruction } from '$lib/destruction/context';
  import type { FileDamage } from '$lib/destruction/model';
  import { createTextDestruction, supportsDestruction } from '$lib/destruction/text';

  let { damage, file, diffCache, reviewId, findings, catalog, config, armed, lineSelection, selectionEnabled = true, virtualizer, inspectedFindingId, inspectionActive = false, oninspect, onrelease, onresolve, ondelete, onreply, ondeletereply, onreopencomment, onrendered, onmarkspace, onhistory, isCurrentRevision = () => false, oncontext, onhidden }: {
    damage?: FileDamage;
    reviewId: string; oncontext: (file: DiffFile, lineCounts: DiffLineCounts) => void; onhidden: (ids: string[]) => void;
    diffCache: DiffCache; file: DiffFile; findings: Finding[]; catalog: Catalog; config: Config; armed: boolean; virtualizer: Virtualizer;
    lineSelection?: { from: Aim; aim: Aim };
    selectionEnabled?: boolean;
    inspectedFindingId?: string; inspectionActive?: boolean; oninspect: (id: string, open: boolean) => void; onrelease: (id: string) => void;
    onresolve: (id: string) => void; ondelete: (id: string) => void; onrendered: () => void; onmarkspace: (space: number) => void;
    onreply: (id: string, comment: string) => Promise<boolean>; onreopencomment: (id: string) => void;
    ondeletereply: (id: string, replyId: string) => Promise<boolean>;
    onhistory?: (finding: Finding) => void; isCurrentRevision?: (finding: Finding) => boolean;
  } = $props();
  type Marker = { finding: Finding; top: number; size: number };
  let container: HTMLDivElement;
  let stage: HTMLDivElement;
  let mounted = $state(false);
  const destruction = useDestruction();
  let destructionRoot = $state.raw<ShadowRoot>();
  let textDestruction: ReturnType<typeof createTextDestruction> | undefined;
  $effect(() => {
    if (!mounted || !damage || !supportsDestruction()) return;
    const root = destructionRoot;
    if (!root) return;
    const surface = textDestruction = createTextDestruction(root, damage, container);
    const detach = destruction?.surface(damage.key, surface);
    return () => { detach?.(); surface.dispose(); if (textDestruction === surface) textDestruction = undefined; };
  });
  // Replace complete marker lists while retaining the findings' identities.
  let markers = $state.raw<Marker[]>([]);
  let expandedClusters = $state(new Set<string>());
  let focused = $state<string>();
  let highlightedId = $derived(focused || inspectedFindingId);
  let markOpacity = $derived(highlightedId ? config.display.markFocusOpacity : config.display.markOverlayOpacity);
  function hoverFinding(id: string, active: boolean) {
    if (active) focused = id;
    // A neighbor may have taken over before this badge's delayed close runs.
    else if (focused === id) focused = undefined;
  }
  let badgeSize = $derived(Math.min(config.display.badgeSize, config.display.lineHeight - 2));
  let clusters = $derived(groupFindingMarkers(markers, badgeSize, config.display.badgeGap));
  let instance: VirtualizedFileDiff<string>;
  let host: HTMLElement;
  let pool: WorkerPoolManager;
  let activeTheme = '';
  let colorProfileDirty = true;
  let diffColors = $state.raw<{ theme: string; accent: string; foreground: string; backgrounds: string[] }>();
  let markProfile = $derived.by(() => {
    if (!diffColors || diffColors.theme !== config.display.diffTheme) return config.display.diffTheme === 'github-light' ? lightColorProfile : darkColorProfile;
    const { accent, foreground, backgrounds } = diffColors;
    return colorProfile(accent, [...backgrounds, ...backgrounds.map(background => formatHex(interpolate([background, foreground], 'rgb')(markOpacity))!)]);
  });
  let markColor = $derived(withColorOpacity(userPalette(config.display.diffInlineMarkColor.slice(0, 7), markProfile, 3).foreground, colorOpacityPercent(config.display.diffInlineMarkColor)));
  let parsed: FileDiffMetadata | undefined;
  let previousRenderKey = '';
  let previousOptionsKey = '';
  let renderKey = $derived(JSON.stringify([reviewId, file.path, file.revision, file.comparison?.base, file.comparison?.head, config.review.contextLines]));
  let optionsKey = $derived(JSON.stringify([config.display.diffTheme, config.display.diffStyle, config.display.fontSize, config.display.lineHeight, config.review.expansionLines, config.review.virtualChunkLines]));
  let contentController = new AbortController();
  let error = $state('');
  let decorationFrame = 0;
  let rowLookup = $derived(diffCache.index(file));
  let markIndex = $derived(new DiffMarkIndex(diffCache.rows(file)));
  let annotationGroups = $derived.by(() => {
    const groups = new Map<string, { side: 'additions' | 'deletions'; lineNumber: number; findings: Finding[] }>();
    for (const finding of findings) {
      if (finding.code || !finding.ranges?.length || (finding.status === 'resolved' && !config.display.showResolved)) continue;
      const anchor = finding.ranges.at(-1)!;
      const key = `${anchor.side}:${anchor.end}`;
      let group = groups.get(key);
      if (!group) { group = { side: anchor.side, lineNumber: anchor.end, findings: [] }; groups.set(key, group); }
      group.findings.push(finding);
    }
    return groups;
  });
  // Pierre compares metadata by identity. Keep it stable when only messages
  // change so an agent reply cannot detach and blur an active text input.
  let annotations = $derived([...annotationGroups].map(([key, group]) => ({ side: group.side, lineNumber: group.lineNumber, metadata: key })));
  const contexts = getAllContexts();
  const mountedAnnotations = new Map<string, { node: HTMLDivElement; props: ComponentProps<typeof CommentAnnotation>; component?: ReturnType<typeof mount> }>();

  $effect(() => {
    const current = catalog;
    // Refresh response pickers without remounting an in-progress inline reply.
    for (const entry of mountedAnnotations.values()) entry.props.catalog = current;
  });

  function annotationProps(annotation: DiffLineAnnotation<string>) {
    return { findings: annotationGroups.get(annotation.metadata)?.findings || [], catalog, reviewId, onreply, onresolve, ondelete, ondeletereply, onreopen: onreopencomment, onhistory, isCurrentRevision };
  }

  function renderAnnotation(annotation: DiffLineAnnotation<string>) {
    const key = `${annotation.side}:${annotation.lineNumber}`;
    let entry = mountedAnnotations.get(key);
    if (entry) Object.assign(entry.props, annotationProps(annotation));
    else {
      const node = document.createElement('div');
      // Long comments must wrap inside their column instead of widening code.
      node.style.contain = 'inline-size';
      const props = $state(annotationProps(annotation));
      entry = { node, props };
      mountedAnnotations.set(key, entry);
      const current = entry;
      // Keep the component lifecycle outside the diff's update effect.
      queueMicrotask(() => {
        if (mountedAnnotations.get(key) === current) current.component = mount(CommentAnnotation, { target: node, props, context: contexts });
      });
    }
    return entry.node;
  }

  let coverage = $derived(findings
    .filter(finding => finding.code && finding.ranges && (finding.status === 'open' || config.display.showResolved))
    .map(finding => ({ finding, covered: rowLookup.covered(finding.ranges!) }))
    .filter(entry => entry.covered.length));
  let markedNodes = new Map<HTMLElement, string>();
  let rowMarks = $derived.by(() => {
    const marked = new Set<DiffRow>();
    for (const { finding, covered } of coverage) {
      if (highlightedId ? finding.id !== highlightedId : finding.status !== 'open') continue;
      for (const row of covered) marked.add(row);
    }
    return markIndex.ranges(marked, config.display.diffStyle);
  });

  function scheduleDecorations() {
    cancelAnimationFrame(decorationFrame);
    decorationFrame = requestAnimationFrame(decorate);
  }

  function decorate() {
    const root = container?.querySelector('diffs-container')?.shadowRoot;
    if (!root || !stage) return;
    const surface = root.querySelector<HTMLElement>('pre');
    if (colorProfileDirty && surface) {
      const [accent, foreground, ...backgrounds] = readColorVariables(surface, ['--diffs-modified-base', '--diffs-fg', '--diffs-bg', '--diffs-bg-context', '--diffs-bg-context-gutter', '--diffs-bg-addition', '--diffs-bg-deletion']);
      diffColors = { theme: config.display.diffTheme, accent, foreground, backgrounds };
      colorProfileDirty = false;
    }
    const nextMarks = new Map<HTMLElement, string>();
    // Only inspect code rows when there are line findings. Gutter lookup is
    // indexed once per column, and unchanged markings don't write to the DOM.
    if (rowMarks.size) {
      const gutters = new Map<Element, Map<string, HTMLElement>>();
      for (const element of root.querySelectorAll<HTMLElement>('[data-line]')) {
        const code = element.closest('[data-code]')!;
        const deletion = code.hasAttribute('data-deletions') || element.dataset.lineType === 'change-deletion';
        const address = (deletion ? rowLookup.deletions : rowLookup.additions).get(Number(element.dataset.line));
        const edges = address && rowMarks.get(address)?.[deletion ? 'deletions' : 'additions'];
        if (edges === undefined) continue;
        let column = gutters.get(code);
        if (!column) {
          column = new Map([...code.querySelectorAll<HTMLElement>('[data-column-number][data-line-index]')].map(node => [node.dataset.lineIndex!, node]));
          gutters.set(code, column);
        }
        nextMarks.set(element, edges);
        const gutter = column.get(element.dataset.lineIndex!);
        if (gutter) nextMarks.set(gutter, edges);
      }
    }
    for (const [node, edges] of nextMarks) {
      if (markedNodes.get(node) === edges) continue;
      node.setAttribute('data-pr-mark', edges);
    }
    for (const node of markedNodes.keys()) {
      if (nextMarks.has(node)) continue;
      node.removeAttribute('data-pr-mark');
    }
    markedNodes = nextMarks;
    // Commit row selection and its appearance in the same frame. Updating
    // opacity in the template first briefly brightens every previous mark.
    container.style.setProperty('--pr-mark-opacity', `${markOpacity * 100}%`);
    container.style.setProperty('--diff-inline-mark-color', markColor);
    const next: Marker[] = [];
    const hidden: string[] = [];
    for (const annotation of annotations) {
      if (!instance.getLinePosition(annotation.lineNumber, annotation.side)) hidden.push(...(annotationGroups.get(annotation.metadata)?.findings || []).map(finding => finding.id));
    }
    for (const { finding, covered } of coverage) {
      const positionFor = (row: DiffRow) => instance.getLinePosition(row.additions ?? row.deletions!, row.additions === undefined ? 'deletions' : 'additions');
      // Position the badge from the full range, even if its middle is virtualized.
      const position = positionFor(covered[Math.floor((covered.length - 1) / 2)]);
      if (!position) { hidden.push(finding.id); continue; }
      const size = badgeSize * (covered.length > 1 ? config.display.rangeBadgeScale : 1);
      const first = positionFor(covered[0]), last = positionFor(covered.at(-1)!);
      let center = position.top + position.height / 2;
      if (first && last) {
        const top = Math.min(first.top, last.top), bottom = Math.max(first.top + first.height, last.top + last.height);
        center = Math.max(top + size / 2, Math.min(center, bottom - size / 2));
      }
      next.push({ finding, top: center - size / 2, size });
    }
    next.sort((a, b) => a.top - b.top || b.size - a.size);
    onmarkspace(Math.max(badgeSize * 2 + config.display.badgeGap, ...next.map(marker => marker.size)) + config.display.fileBadgePaddingPx);
    onhidden(hidden);
    if (next.length !== markers.length || next.some((marker, index) => {
      const previous = markers[index];
      return marker.finding !== previous.finding || marker.top !== previous.top || marker.size !== previous.size;
    })) markers = next;
  }

  async function loadDiffFiles() {
    const renderedFile = file;
    const comparison = renderedFile.comparison;
    const signal = contentController.signal;
    if (!comparison) throw new Error('This diff has no saved comparison.');
    const query = new URLSearchParams({ reviewId, path: renderedFile.path, base: comparison.base, head: comparison.head });
    try {
      const response = await fetch(`/api/file-contents?${query}`, { signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load more context.');
      const contents = result as DiffContents;
      if (!signal.aborted) { oncontext(renderedFile, contents.lineCounts); error = ''; }
      return contents;
    } catch (e) {
      if (!signal.aborted) error = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  const postRender: NonNullable<FileDiffOptions<string, undefined>['onPostRender']> = (_container, _instance, phase) => {
    textDestruction?.refresh();
    colorProfileDirty = true;
    scheduleDecorations();
    if (phase !== 'unmount') onrendered();
  };

  $effect(() => {
    if (!mounted) return;
    const key = renderKey, settings = optionsKey, lineAnnotations = annotations;
    // Snapshot objects and gameplay state can change without changing the code.
    // Pierre compares callback identity when deciding whether to force a render.
    untrack(() => {
      const contentChanged = previousRenderKey !== key;
      if (contentChanged) {
        contentController.abort();
        contentController = new AbortController();
      }
      if (!instance || previousOptionsKey !== settings) {
        const options: FileDiffOptions<string, undefined> = {
          theme: config.display.diffTheme, themeType: config.display.diffTheme === 'github-light' ? 'light' : 'dark', diffStyle: config.display.diffStyle,
          disableFileHeader: true, diffIndicators: 'bars', overflow: 'scroll', lineHoverHighlight: 'both', hunkSeparators: 'line-info',
          expansionLineCount: config.review.expansionLines,
          loadDiffFiles, onPostRender: postRender, renderAnnotation,
          unsafeCSS: diffStyles
        };
        if (!instance) {
          pool = getOrCreateWorkerPoolSingleton({ poolOptions: { workerFactory: () => new Worker(WorkerUrl, { type: 'module' }), poolSize: config.review.highlightWorkers, totalASTLRUCacheSize: config.review.highlightCacheEntries }, highlighterOptions: { theme: config.display.diffTheme } });
          instance = new VirtualizedFileDiff(options, virtualizer, { lineHeight: config.display.lineHeight, hunkLineCount: config.review.virtualChunkLines }, pool);
          host = document.createElement('diffs-container');
          container.append(host);
        } else instance.setOptions(options);
        host.dataset.prTheme = config.display.diffTheme;
        colorProfileDirty = true;
        instance.setMetrics({ lineHeight: config.display.lineHeight, hunkLineCount: config.review.virtualChunkLines });
        previousOptionsKey = settings;
      }
      if (activeTheme !== config.display.diffTheme) {
        activeTheme = config.display.diffTheme;
        void pool.setRenderOptions({ theme: config.display.diffTheme }).catch(e => error = String(e));
      }
      if (contentChanged) {
        // Hydration mutates this object. Keep it until the comparison changes.
        parsed = undefined;
        try { parsed = diffCache.parsed(file, key); previousRenderKey = key; error = ''; }
        catch (e) { error = e instanceof Error ? e.message : String(e); }
      }
      if (parsed) instance.render({ fileDiff: parsed, fileContainer: host, lineAnnotations });
      destructionRoot = host.shadowRoot || undefined;
      const currentAnnotations = new Map(lineAnnotations.map(annotation => [`${annotation.side}:${annotation.lineNumber}`, annotation]));
      for (const [key, entry] of mountedAnnotations) {
        const annotation = currentAnnotations.get(key);
        if (annotation) Object.assign(entry.props, annotationProps(annotation));
        else {
          if (entry.component) void unmount(entry.component);
          mountedAnnotations.delete(key);
        }
      }
      scheduleDecorations();
    });
  });

  $effect(() => { findings; catalog; config.display; highlightedId; coverage; rowMarks; markOpacity; markColor; if (mounted) scheduleDecorations(); });
  $effect(() => {
    if (!mounted) return;
    renderKey;
    const selection = lineSelection;
    untrack(() => instance?.setSelectedLines(selection?.from.line && selection.aim.line ? {
      start: selection.from.line!, side: selection.from.side,
      end: selection.aim.line!, endSide: selection.aim.side
    } : null));
  });
  $effect(() => {
    if (focused && !findings.some(f => f.id === focused && (f.status === 'open' || config.display.showResolved))) focused = undefined;
  });
  $effect(() => {
    if (inspectedFindingId && mounted && !markers.some(marker => marker.finding.id === inspectedFindingId)) {
      onrelease(inspectedFindingId);
    }
  });

  onMount(() => {
    mounted = true;
    const observer = new ResizeObserver(scheduleDecorations); observer.observe(container);
    return () => {
      if (inspectedFindingId && markers.some(marker => marker.finding.id === inspectedFindingId)) onrelease(inspectedFindingId);
      contentController.abort(); cancelAnimationFrame(decorationFrame); observer.disconnect(); instance?.cleanUp();
      for (const entry of mountedAnnotations.values()) if (entry.component) void unmount(entry.component);
      mountedAnnotations.clear();
    };
  });
</script>

<div class="diff-stage relative" class:markers-right={config.display.sidebarLeft} bind:this={stage}>
  <div class={['pierre-diff diff-surface', (armed || config.experience.mode === 'review' && selectionEnabled) && 'select-none']} class:armed style:--pr-code-cursor={armed ? 'var(--combat-cursor)' : 'default'}
    style:--pr-diff-font-size={`${config.display.fontSize}px`} style:--pr-diff-line-height={`${config.display.lineHeight}px`}
    style:--diff-inline-mark-border-width={`${config.display.diffInlineMarkBorderWidthPx}px`} bind:this={container}></div>
  <div class="range-markers pointer-events-none absolute inset-0 z-4">
    {#each clusters as cluster (cluster.markers[0].finding.id)}
      {@const id = cluster.markers[0].finding.id}
      <div class={['range-marker absolute isolate', expandedClusters.has(id) && 'z-40']} style:top={`${cluster.top}px`}
        style:left={config.display.sidebarLeft ? `calc(100% + ${config.display.fileBadgePaddingPx}px)` : undefined}
        style:right={config.display.sidebarLeft ? undefined : `calc(100% + ${config.display.fileBadgePaddingPx}px)`}>
        <FileFindingCluster inline path={file.path} findings={cluster.markers.map(marker => marker.finding)} sizes={new Map(cluster.markers.map(marker => [marker.finding.id, marker.size]))}
          {catalog} {config} size={badgeSize} inspected={cluster.markers.some(marker => marker.finding.id === inspectedFindingId) ? inspectedFindingId : undefined}
          {inspectionActive} {oninspect} onhover={hoverFinding} {onresolve} onreopen={onreopencomment} {ondelete} onhistory={finding => onhistory?.(finding)} {isCurrentRevision}
          onexpanded={expanded => { if (expanded) expandedClusters.add(id); else expandedClusters.delete(id); expandedClusters = new Set(expandedClusters); }} />
      </div>
    {/each}
  </div>
</div>
{#if error}<div class="flex min-h-[190px] flex-col items-center justify-center gap-4 px-5 py-8 text-center text-muted-foreground"><h3 class="text-2xl text-foreground">DIFF COULD NOT RENDER</h3><p class="max-w-[490px] text-sm">{error}</p></div>{/if}
