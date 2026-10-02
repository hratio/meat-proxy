<script lang="ts">
  import { reviewFetch as fetch } from '$review-client';
  import { mergeProps } from 'bits-ui';
  import type { FileSectionState, FileViewSelection } from '$lib/file-section-state';
  import { onMount, onDestroy, untrack, type Snippet } from 'svelte';
  import { fade } from 'svelte/transition';
  import { Check, FileCode, ChevronDown, ChevronUp } from '@lucide/svelte';
  import { toast } from '$lib/notifications';
  import type { Virtualizer } from '@pierre/diffs';
  import type { DiffCache } from '$lib/diff-cache';
  import type { Catalog, Config } from '$lib/config';
  import type { ChooseViolation } from '$lib/review-selection';
  import type { Aim, DiffFile, DiffLineCounts, FileHistoryEntry, Finding, TabletCelebration } from '$lib/types';
  import { findingForFile, sameComparison } from '$lib/location';
  import { queueDiffRender } from '$lib/render-queue';
  import { isScrollbarAtPoint } from '$lib/ui/interaction';
  import { pointerIntent } from '$lib/ui/pointer-intent-action';
  import { useCombat } from '$lib/ui/combat.svelte';
  import { Button } from '$lib/components/ui/button';
  import FilePathActions from './FilePathActions.svelte';
  import DiffView from './DiffView.svelte';
  import DestructionBorder from './DestructionBorder.svelte';
  import DestructionHealth from './DestructionHealth.svelte';
  import { useDestruction } from '$lib/destruction/context';
  import { destructionKey, type FileDamage } from '$lib/destruction/model';
  import { createPanelDestruction } from '$lib/destruction/panel';
  import StoneTablet from './StoneTablet.svelte';
  import FileFindingCluster from './FileFindingCluster.svelte';
  import Hint from './Hint.svelte';
  import ReviewRounds from './ReviewRounds.svelte';
  import FileComparison from './FileComparison.svelte';
  import CommentThread from './CommentThread.svelte';

  let { loading, historyEntries, initialState, onsuspend, onretain, viewSelection, onviewselect, viewActive = true, file: liveFile, diffCache, findings, catalog, config, armed, lineSelection, onselection, reviewed: liveReviewed, celebration: liveCelebration, reviewId, onview, requestedFinding, inspectedFindingId, oninspect, scrollRoot, stickyCeiling, virtualizer, register, oncomplete, onreopen, onresolve, ondelete, onreply, ondeletereply, onreopencomment, ondestruction }: {
    loading?: Snippet;
    historyEntries?: FileHistoryEntry[]; initialState?: FileSectionState; onsuspend?: (state: FileSectionState) => void; onretain?: (retained: boolean) => void;
    viewSelection?: FileViewSelection; onviewselect?: (path: string, selection: FileViewSelection) => void; viewActive?: boolean;
    reviewId: string; onview: (path: string, file?: DiffFile) => void; requestedFinding?: { id: string; at: number };
    inspectedFindingId?: string; oninspect: (id?: string) => void;
    diffCache: DiffCache; file: DiffFile; findings: Finding[]; catalog: Catalog; config: Config; armed: boolean;
    lineSelection?: { from: Aim; aim: Aim };
    onselection?: ChooseViolation;
    ondestruction?: (file: DiffFile) => void;
    reviewed: boolean; celebration?: TabletCelebration; scrollRoot: HTMLElement; stickyCeiling: number; virtualizer: Virtualizer;
    register: (path: string, element: HTMLElement, reveal: () => void, toggle: () => void) => () => void;
    oncomplete: (path: string) => void; onreopen: (path: string) => void; onresolve: (id: string) => void; ondelete: (id: string) => void;
    onreply: (id: string, comment: string) => Promise<boolean>; onreopencomment: (id: string) => void;
    ondeletereply: (id: string, replyId: string) => Promise<boolean>;
  } = $props();

  const restored = untrack(() => initialState);
  const gameEnabled = $derived(config.experience.mode === 'game');
  let localView = $state<FileViewSelection>({ kind: restored?.viewKind || 'latest', round: restored?.viewRound, finding: restored?.viewFinding });
  let chosenView = $derived(viewSelection || localView);
  let viewKind = $derived(chosenView.kind);
  let viewRound = $derived(chosenView.round);
  let viewFinding = $derived(chosenView.finding);
  let override = $state<DiffFile | undefined>(restored?.override);
  let entries = $state<FileHistoryEntry[]>(restored?.entries || []);
  let busy = $state(false);
  let historyLoading = $state(false);
  let loadedHistoryKey = restored?.loadedHistoryKey || '';
  let historyKey = $derived(JSON.stringify([reviewId, liveFile.path, liveFile.revision, liveFile.live?.head, liveFile.live?.round, liveFile.live?.count, liveFile.live?.completed]));
  let collapsed = $state(restored?.collapsed || false);
  let folded = $derived(collapsed && config.display.fileView === 'all');
  let requestNumber = 0;
  let expandedContext = $state<{ file: DiffFile; lineCounts: DiffLineCounts } | undefined>(restored?.expandedContext);
  let currentFile = $derived(override || liveFile);
  let contextLoaded = $derived(expandedContext?.file.revision === currentFile.revision && sameComparison(expandedContext.file.comparison, currentFile.comparison));
  let file = $derived(contextLoaded ? { ...currentFile, lineCounts: expandedContext!.lineCounts } : currentFile);
  let historical = $derived(viewKind === 'history');
  let liveReminder = $state(0);
  let reviewed = $derived(liveReviewed && !historical);
  let celebration = $derived(historical ? undefined : liveCelebration);
  const destruction = useDestruction();
  let damage = $state.raw<FileDamage>();
  let destructionShots = $state(0);
  let destructionDamage = $state(0);
  $effect(() => {
    const current = file, eligible = gameEnabled && !historical && !reviewed && !celebration && !busy;
    const retainFinished = gameEnabled && !historical && !!celebration;
    return destruction?.subscribe(current.path, () => {
      const previous = untrack(() => damage);
      // Keep the fatal hit visible while the confirmed completion exits. The
      // controller may already have discarded its reviewed target by then.
      const state = eligible ? destruction.target(current)
        : retainFinished && previous?.finished && previous.key === destructionKey(current) ? previous : undefined;
      damage = state;
      destructionShots = state?.shots || 0;
      destructionDamage = state?.damage || 0;
    });
  });
  let renderedFindings = $derived(findings.flatMap(f => { const visible = findingForFile(f, file); return visible ? [visible] : []; }));
  let revisionIndex = $derived(entries.findIndex(entry => historical ? entry.id === (viewRound || file.round) : entry.current));
  let findingSnapshot = $derived(historical && !busy && revisionIndex < 0 && file.comparison?.kind === 'history' ? file.comparison : undefined);
  let status = $derived(file.status === '?' ? 'A' : file.status.charAt(0));
  let statusLabel = $derived(({ A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed', C: 'Copied', T: 'Type changed' } as Record<string, string>)[status] || status);
  let deltaBoxes = $derived.by(() => {
    const count = config.display.diffStatBoxes;
    const total = file.additions + file.deletions;
    const scale = Math.min(count, total);
    const added = total ? Math.floor(file.additions * scale / total) : 0;
    const removed = total ? Math.floor(file.deletions * scale / total) : 0;
    return Array.from({ length: count }, (_, i) => i < added ? 'addition' : i < added + removed ? 'deletion' : 'empty');
  });
  let showVersions = $derived(!!liveFile.live);
  let historyExpanded = $state(restored?.historyExpanded || false);
  let historyCount = $derived(entries.filter(entry => !entry.current).length);
  // Finding inspection exposes the selected round without hiding its context.
  $effect(() => { if (historical) historyExpanded = true; });
  let header: HTMLDivElement;
  let headerClip = $state(0);
  let headerStart = $state<HTMLSpanElement>();
  let headerScrolled = $state(false);
  let targetHeader = $state<HTMLDivElement>();
  let targetRoom = $state<number>();
  let targetHeaderHeight = $state(0);
  let targetHovered = $state(false);
  let targetFocused = $state(false);
  let targetApproaching = $state(false);
  const combat = useCombat();

  async function fetchView(kind: 'latest' | 'head' | 'history', round?: string, finding?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ reviewId, path: liveFile.path, kind });
    if (round) query.set('round', round);
    if (finding) query.set('finding', finding);
    const response = await fetch(`/api/file?${query}`, { signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load this review round.');
    return result as { file: DiffFile; entries: FileHistoryEntry[] };
  }

  function chooseView(kind: 'latest' | 'head' | 'history', round?: string, finding?: string) {
    if (viewKind === kind && viewRound === round && viewFinding === finding) return;
    const selection = { kind, round, finding };
    if (onviewselect) onviewselect(liveFile.path, selection);
    else localView = selection;
    if (kind === 'latest') override = undefined;
  }

  function isCurrentRevision(finding: Finding) {
    if (finding.comparison) return sameComparison(finding.comparison, file.comparison);
    return !!finding.version && !historical && finding.version === file.live?.version;
  }

  function inspectHistory(finding: Finding) {
    collapsed = false;
    // Keep a current finding in its live comparison, including findings made
    // from Overall after Live has moved to a completed review baseline.
    if (finding.comparison && sameComparison(finding.comparison, liveFile.comparison)) chooseView('latest');
    else if (liveFile.live && finding.comparison?.base === liveFile.live.head && finding.comparison?.head === liveFile.comparison?.head) chooseView('head');
    else chooseView('history', undefined, finding.id);
  }

  function chooseRound(entry: FileHistoryEntry) {
    chooseView(entry.current ? 'latest' : 'history', entry.current ? undefined : entry.id);
  }

  function stepRevision(direction: -1 | 1) {
    if (busy || historyLoading || revisionIndex < 0) return;
    const entry = entries[revisionIndex + direction];
    if (entry) chooseRound(entry);
  }

  $effect(() => {
    const kind = viewKind, round = viewRound, finding = viewFinding;
    reviewId;
    // A historical view stays on its loaded snapshot while new versions arrive.
    // Only the HEAD view follows the current contents and moving Git baseline.
    if (kind === 'head') { liveFile.revision; liveFile.live?.head; liveFile.live?.round; liveFile.live?.completed; }
    const request = ++requestNumber;
    if (kind === 'latest') { override = undefined; busy = false; return; }
    // Expanded context can keep a section mounted outside the viewport. Its
    // selection changes immediately, but fetching waits until it is nearby.
    if (!viewActive) { busy = false; return; }
    const controller = new AbortController();
    busy = true;
    void fetchView(kind, round, finding, controller.signal).then(result => {
      if (request !== requestNumber) return;
      override = result.file; entries = result.entries;
      // The server can recognize a current comparison that arrived after the
      // browser snapshot. Adopt its mode so Live/Overall keep following edits.
      const resolvedKind = result.file.comparison?.kind;
      if (finding && (resolvedKind === 'latest' || resolvedKind === 'head')) chooseView(resolvedKind);
    }).catch(error => {
      if (controller.signal.aborted) return;
      toast.error(error.message); chooseView('latest');
    }).finally(() => { if (request === requestNumber) busy = false; });
    return () => controller.abort();
  });
  $effect(() => { const current = file; untrack(() => onview(current.path, current)); });
  $effect(() => {
    if (requestedFinding) {
      const finding = untrack(() => findings.find(f => f.id === requestedFinding?.id));
      if (finding?.version) untrack(() => inspectHistory(finding));
    }
  });

  let section: HTMLElement;
  let body: HTMLDivElement;
  let ready = $state(false);
  let painted = $state(false);
  let measured = $state<{ key: string; height: number } | undefined>(restored?.measured);
  let inspectionArea = $state<{ id: string; area: 'file' | 'diff' }>();
  let focused = $state<string>();
  let lineMarkSpace = $state(0);
  let hiddenFindings = $state<string[]>([]);
  let locatedFindings = $derived.by(() => {
    if (file.patchPending) return new Set(file.locatedFindings || renderedFindings.map(finding => finding.id));
    const index = renderedFindings.some(finding => finding.ranges) ? diffCache.index(file) : undefined;
    return new Set(renderedFindings.filter(finding => !finding.ranges || index?.has(finding.ranges)).map(finding => finding.id));
  });
  let fileFindings = $derived(findings.filter(f => f.code && (folded || !f.ranges || hiddenFindings.includes(f.id) || !locatedFindings.has(f.id)) && (config.display.showResolved || f.status === 'open')));
  let fileComments = $derived(findings.filter(f => !f.code && (!f.ranges || hiddenFindings.includes(f.id) || !locatedFindings.has(f.id)) && (config.display.showResolved || f.status === 'open')));
  let badgesExpanded = $state(false);
  let inspectedFileFinding = $derived(inspectionArea?.area === 'file' && inspectionArea.id === inspectedFindingId ? fileFindings.find(f => f.id === inspectedFindingId) : undefined);
  let inspectedDiffFindingId = $derived(inspectionArea?.area === 'diff' && inspectionArea.id === inspectedFindingId ? inspectedFindingId : undefined);
  let highlightedFileFindingId = $derived(focused || inspectedFileFinding?.id);
  let badgeSize = $derived(Math.min(config.display.badgeSize, config.display.lineHeight - 2));
  let fileBadgeSize = $derived(fileFindings.length === 1 ? badgeSize * config.display.rangeBadgeScale - 2 : badgeSize);
  // Keep code columns stable, but reserve target space only for visible badges.
  let fileBadgeGutter = $derived(badgeSize * 2 + config.display.badgeGap + config.display.fileBadgePaddingPx);
  let hasFileBadges = $derived(fileFindings.length > 0);
  let fileBadgeColumns = $derived(Math.min(fileFindings.length, 2));
  let fileBadgeWidth = $derived(fileBadgeColumns * fileBadgeSize + Math.max(0, fileBadgeColumns - 1) * config.display.badgeGap);
  let fileBadgeRows = $derived(Math.ceil(Math.min(fileFindings.length, 4) / 2));
  let fileBadgeHeight = $derived(fileBadgeRows * fileBadgeSize + Math.max(0, fileBadgeRows - 1) * config.display.badgeGap);
  // A sticky header travels over line findings even without its own badges.
  let reserveLineBadges = $derived(headerScrolled && !folded);
  let targetBadgeGutter = $derived(Math.max(hasFileBadges ? fileBadgeWidth + config.display.fileBadgePaddingPx : 0, reserveLineBadges ? Math.max(fileBadgeGutter, lineMarkSpace) : 0));
  let normalTargetGap = $derived(Math.max(4, (hasFileBadges || reserveLineBadges ? Math.max(config.display.fileTargetGutterPx, targetBadgeGutter) : 0) + config.display.fileTargetGapPx + config.display.fileTargetOffsetX));
  // Share the gutter with passing badges when space is tight. The target
  // must never move or narrow the file, including after it disappears.
  let availableTargetRoom = $derived(targetRoom ?? Infinity);
  let targetStacked = $derived(hasFileBadges && !reserveLineBadges && normalTargetGap + config.display.fileTargetSize > availableTargetRoom);
  let targetSize = $derived(Math.min(config.display.fileTargetSize, Math.max(0, availableTargetRoom - 4)));
  let targetGap = $derived(Math.max(4, Math.min(availableTargetRoom - targetSize,
    targetStacked ? config.display.fileBadgePaddingPx + config.display.fileTargetOffsetX : normalTargetGap)));
  let targetTop = $derived(targetStacked
    ? Math.max(targetHeaderHeight - targetSize / 2, fileBadgeHeight + Math.max(4, config.display.fileTargetGapPx)) + config.display.fileTargetOffsetY
    : targetHeaderHeight - targetSize / 2 + config.display.fileTargetOffsetY);
  let markSpace = $derived(Math.max(folded ? 0 : lineMarkSpace, fileBadgeGutter));
  let layoutKey = $derived(`${file.revision}:${file.comparison?.base}:${file.comparison?.head}:${config.display.diffStyle}:${config.display.lineHeight}`);
  let hasDiff = $derived(!file.binary && !file.omitted && file.patch.includes('@@'));
  let placeholderSurface = $state<HTMLDivElement>();
  $effect(() => {
    if (!damage || !placeholderSurface || hasDiff || file.patchPending) return;
    const surface = createPanelDestruction(placeholderSurface, damage);
    const detach = destruction?.surface(damage.key, surface);
    return () => { detach?.(); surface.dispose(); };
  });
  let estimatedHeight = $derived.by(() => {
    if (file.patchPending) {
      const rows = config.display.diffStyle === 'split' ? Math.max(file.additions, file.deletions) : file.additions + file.deletions;
      return rows ? (rows + config.review.contextLines * 2 + 2) * config.display.lineHeight + 16 : 220;
    }
    if (!hasDiff) return 220;
    let rows = 0, additions = 0, deletions = 0;
    const flush = () => { rows += config.display.diffStyle === 'split' ? Math.max(additions, deletions) : additions + deletions; additions = deletions = 0; };
    for (const line of file.patch.split('\n')) {
      if (line.startsWith('@@')) { flush(); if (!line.startsWith('@@ -1,')) rows++; }
      else if (line.startsWith('+') && !line.startsWith('+++')) additions++;
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      else if (line.startsWith(' ')) { flush(); rows++; }
    }
    flush();
    return rows * config.display.lineHeight + 16;
  });
  let surfaceHeight = $derived(measured?.key === layoutKey ? measured.height : estimatedHeight);

  function measureTargetRoom() {
    if (!targetHeader) return;
    const rect = targetHeader.getBoundingClientRect(), viewport = scrollRoot.getBoundingClientRect();
    targetHeaderHeight = rect.height;
    targetRoom = Math.max(0, (config.display.sidebarLeft ? viewport.left + scrollRoot.clientWidth - rect.right : rect.left - viewport.left) - 4);
  }
  $effect(() => {
    config.display;
    if (!targetHeader) return;
    // Layout mode changes can move the header without resizing it. Measure
    // after the shell has applied its new column positions.
    const frame = requestAnimationFrame(measureTargetRoom);
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!headerStart) return;
    // Observe the header's natural position; the sticky header itself never
    // crosses the toolbar edge. Use the shell's reactive ceiling so toolbar
    // wrapping on resize cannot leave this observer using an old threshold.
    const observer = new IntersectionObserver(([entry]) => {
      headerScrolled = entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
    }, { root: scrollRoot, rootMargin: `-${stickyCeiling}px 0px 0px 0px` });
    observer.observe(headerStart);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!ready || folded) return;
    config.display;
    let frame = 0;
    // Clip the scrolling content, including its gutter markers, below the
    // actual sticky header. File-level badges remain outside this surface.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        headerClip = Math.max(0, header.getBoundingClientRect().bottom - body.getBoundingClientRect().top);
      });
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(header); resize.observe(body); resize.observe(scrollRoot);
    if (scrollRoot.firstElementChild) resize.observe(scrollRoot.firstElementChild);
    scrollRoot.addEventListener('scroll', schedule, { passive: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame); resize.disconnect();
      scrollRoot.removeEventListener('scroll', schedule);
      headerClip = 0;
    };
  });

  function hoverFinding(id: string, active: boolean) {
    if (active) focused = id;
    // A neighbor may have taken over before this badge's delayed close runs.
    else if (focused === id) focused = undefined;
  }

  function changeInspection(id: string, area: 'file' | 'diff', open: boolean) {
    if (open) { inspectionArea = { id, area }; oninspect(id); }
    else if (inspectedFindingId === id && inspectionArea?.id === id && inspectionArea.area === area) {
      inspectionArea = undefined;
      oninspect(undefined);
    }
  }

  function closeInspection() {
    if (inspectionArea?.id === inspectedFindingId) oninspect(undefined);
    inspectionArea = undefined;
  }

  $effect(() => {
    if (inspectionArea?.area === 'file' && inspectionArea.id === inspectedFindingId && !fileFindings.some(f => f.id === inspectedFindingId)) {
      changeInspection(inspectionArea.id, 'file', false);
    }
  });
  $effect(() => {
    if (inspectionArea && inspectionArea.id !== inspectedFindingId) inspectionArea = undefined;
  });

  $effect(() => {
    if (!ready || liveFile.patchPending || !showVersions) return;
    const key = historyKey;
    if (historyEntries) { entries = historyEntries; loadedHistoryKey = key; historyLoading = false; return; }
    // Completing a fetch updates this cache key. It must not restart the effect
    // and abort its own request before the loading flag is cleared.
    if (untrack(() => loadedHistoryKey === key)) { historyLoading = false; return; }
    const controller = new AbortController();
    historyLoading = true;
    void fetchView('latest', undefined, undefined, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      entries = result.entries;
      loadedHistoryKey = key;
    }).catch(error => { if (!controller.signal.aborted) toast.error(error.message); })
      .finally(() => { if (!controller.signal.aborted) historyLoading = false; });
    return () => controller.abort();
  });


  $effect(() => { onretain?.(contextLoaded); });
  onDestroy(() => onsuspend?.({ viewKind, viewRound, viewFinding, override, entries, loadedHistoryKey, collapsed, historyExpanded, expandedContext, measured }));

  onMount(() => {
    const remindLive = (event: PointerEvent) => {
      if (!historical || busy || event.button !== 0) return;
      const path = event.composedPath();
      if (path.some(node => node instanceof Element && node.matches('button, a, input, textarea, select, [role="button"], [data-expand-button], [data-unmodified-lines]'))) return;
      const target = path.find((node): node is Element => node instanceof Element) || null;
      if (!isScrollbarAtPoint(target, event.clientX, event.clientY)) liveReminder++;
    };
    body.addEventListener('pointerup', remindLive);
    const unregister = register(file.path, section, () => collapsed = false, toggleCollapsed);
    let cancelRender = () => {};
    const observer = new IntersectionObserver(([entry]) => {
      cancelRender();
      if (entry.isIntersecting) {
        cancelRender = queueDiffRender(() => { ready = true; }, config.review.renderBatchSize, Math.max(0, entry.boundingClientRect.top - ((entry.rootBounds?.bottom || 0) - config.review.renderAheadPx), (entry.rootBounds?.top || 0) + config.review.renderAheadPx - entry.boundingClientRect.bottom));
      } else {
        if (ready && !folded) measured = { key: layoutKey, height: body.offsetHeight };
        closeInspection();
        ready = false; painted = false;
      }
    }, { root: scrollRoot, rootMargin: `${config.review.renderAheadPx}px 0px` });
    observer.observe(section);
    const resize = new ResizeObserver(() => {
      if (ready && !folded && body.offsetHeight) measured = { key: layoutKey, height: body.offsetHeight };
    });
    resize.observe(body);
    const headerResize = new ResizeObserver(measureTargetRoom);
    headerResize.observe(header);
    headerResize.observe(scrollRoot);
    if (targetHeader) headerResize.observe(targetHeader);
    return () => {
      body.removeEventListener('pointerup', remindLive);
      cancelRender(); observer.disconnect(); resize.disconnect(); headerResize.disconnect(); unregister(); onview(liveFile.path, undefined);
      closeInspection();
    };
  });

  function toggleCollapsed() {
    if (config.display.fileView !== 'all') return;
    closeInspection(); collapsed = !collapsed; painted = false;
  }
  function chooseFileViolation(event: MouseEvent) {
    if (busy || historical || reviewed) return;
    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const aim = { path: file.path, revision: file.revision, comparison: file.comparison };
    onselection?.({ from: aim, aim }, { x: rect.left + rect.width / 2, y: rect.bottom });
  }

</script>

<section class={["review-file mb-(--file-gap)", !config.display.sidebarLeft && "pl-[max(0px,calc(var(--mark-space)-var(--review-margin)))]"]} class:markers-right={config.display.sidebarLeft} style:--mark-space={`${markSpace}px`} style:--file-badge-padding={`${config.display.fileBadgePaddingPx}px`} data-cursor={historical || busy ? 'native' : undefined} data-file-path={file.path} data-ready={ready} data-reviewed={reviewed || !!celebration} bind:this={section} aria-label={file.path}>
  <div class="file-container group/file relative" class:reviewed={reviewed || !!celebration} data-completed={reviewed || !!celebration} data-destruction={damage ? '' : undefined} data-destruction-shots={damage ? destructionShots : undefined}>
    {#if damage}<DestructionBorder settings={config.destruction} reducedMotion={config.display.reducedMotion} paused={!viewActive || combat?.paused} />{/if}
    <span bind:this={headerStart} class="pointer-events-none absolute top-0 left-0 size-px" aria-hidden="true"></span>
    <div class="file-header-mask sticky top-(--review-ceiling) z-12 bg-background" bind:this={header} style:z-index={badgesExpanded ? 40 : undefined}>
      <div class={['diff-file-header @container/file-header relative flex min-h-(--file-header-height) flex-wrap items-center justify-between gap-x-2.5 gap-y-1 rounded-t border border-muted-foreground/12.5 bg-secondary/70 px-[var(--file-header-padding-left,var(--file-header-padding))]', highlightedFileFindingId && 'inset-shadow-[0_0_0_100vmax] inset-shadow-foreground/12']} class:destruction-active={!!damage} class:markers-right={config.display.sidebarLeft} class:marked={fileFindings.some(f => f.status === 'open')} class:focused={!!highlightedFileFindingId} style:--header-icon-size={`${config.display.fileCopyIconSize}px`} bind:this={targetHeader}>
      {#if (!reviewed || celebration?.phase === 'spinning') && !historical}
        <div class={['file-target-position pointer-events-none absolute top-0 z-30 size-(--target-size)', config.display.sidebarLeft ? 'left-[calc(100%+1px)]' : 'right-[calc(100%+1px)]']}
          style:--target-size={`${targetSize}px`} style:transform={`translate(${config.display.sidebarLeft ? targetGap : -targetGap}px, ${targetTop - 1}px)`} style:transition-duration={config.display.reducedMotion ? '0ms' : '220ms'} data-target-stacked={targetStacked} data-header-scrolled={headerScrolled}>
          <button class="file-target pointer-events-auto relative z-30 m-0 size-(--target-size) rounded-[20%] p-0 drop-shadow-[0_5px_5px_#0008] disabled:opacity-100 [&_.target-model]:size-full"
            use:pointerIntent={{ disabled: busy || !!celebration || combat?.paused, radiusPx: config.targets.approachRadiusPx, sampleMs: config.targets.approachSampleMs,
              confirmMs: config.targets.approachConfirmMs, confidence: config.targets.approachConfidence, releaseMs: config.targets.approachReleaseMs, idleMs: config.targets.approachIdleMs,
              onChange: state => targetApproaching = state.active && !state.inside }}
            disabled={busy} data-cursor={!gameEnabled ? 'native' : undefined} class:celebrating={!!celebration} data-complete-file={file.path} aria-label={`Mark ${file.path} reviewed`} aria-pressed={!!celebration}
            onpointerenter={event => { if (event.pointerType !== 'touch') targetHovered = true; }} onpointerleave={() => targetHovered = false} onpointercancel={() => targetHovered = false}
            onfocus={event => targetFocused = event.currentTarget.matches(':focus-visible')} onblur={() => targetFocused = false}
            out:fade={{ duration: celebration?.fadeMs ?? 0 }} onclick={event => { if (!gameEnabled || event.detail === 0) oncomplete(file.path); }}><StoneTablet {config} {celebration} hovered={!busy && (targetHovered || targetFocused)} anticipating={targetApproaching} /></button>
        </div>
      {/if}
        <FileFindingCluster path={file.path} findings={fileFindings} {catalog} {config} size={fileBadgeSize}
          inspected={inspectedFileFinding?.id} inspectionActive={!!inspectedFindingId}
          onhover={hoverFinding} oninspect={(id, open) => changeInspection(id, 'file', open)} {onresolve} onreopen={onreopencomment} {ondelete} onhistory={inspectHistory} {isCurrentRevision} onexpanded={value => badgesExpanded = value} />
        {#if config.display.fileView === 'all'}
          <Hint text={folded ? 'Expand file' : 'Collapse file'}>
            {#snippet children({ props })}
              <Button {...mergeProps(props, { onclick: toggleCollapsed })} variant="ghost" size="icon-xs" class="file-collapse size-(--file-copy-size)" aria-label={`${folded ? 'Expand' : 'Collapse'} ${file.path}`} aria-expanded={!folded}>
                {#if folded}<ChevronDown class="size-(--header-icon-size)" />{:else}<ChevronUp class="size-(--header-icon-size)" />{/if}
              </Button>
            {/snippet}
          </Hint>
        {/if}
        <div class="file-path-controls flex min-w-0 flex-1 items-center self-stretch gap-2">
          <button class="file-hitbox flex min-w-0 flex-[0_1_auto] items-center self-stretch gap-[9px] text-left text-muted-foreground [&.marked]:text-primary" class:marked={findings.some(f => f.code && !f.ranges && f.status === 'open')} aria-label={`${reviewed ? 'Reopen' : 'Mark file'} ${file.path}`} onclick={event => { if (event.detail === 0) { if (reviewed) onreopen(file.path); else if (!gameEnabled) chooseFileViolation(event); } }}>
            <span class="flex items-center gap-[7px] overflow-hidden font-sans text-sm whitespace-nowrap text-muted-foreground">{#if file.path.includes('/')}<span>{file.path.split('/').slice(0, -1).join('/')}</span><span class="text-muted-foreground/50">/</span>{/if}<strong class="font-[550] text-foreground">{file.path.split('/').at(-1)}</strong></span>
          </button>
          <FilePathActions path={file.path} editorPath={liveFile.path} {reviewId} {config} />
        </div>
        {#if damage}<DestructionHealth hits={destructionDamage} maximum={damage.combat?.health ?? config.destruction.shotsToComplete} reducedMotion={config.display.reducedMotion} />{/if}
        {#if showVersions && (historyCount > 0 || historical)}
          <div class="file-comparison-slot">
            <FileComparison path={file.path} kind={viewKind} round={historical ? entries[revisionIndex]?.number : undefined} {historyCount} newer={historical && file.revision !== liveFile.revision} reminder={historical ? liveReminder : 0} reducedMotion={config.display.reducedMotion} bind:expanded={historyExpanded} busy={busy || historyLoading} onselect={kind => chooseView(kind)} />
          </div>
        {/if}
        <div class="file-statistics flex shrink-0 items-center gap-2 text-xs">
          <span class="inline-flex gap-[.2em] tabular-nums" aria-label={`${file.additions} additions, ${file.deletions} deletions`}><span class="text-(--green)">+{file.additions}</span><span class="text-(--red)">−{file.deletions}</span></span>
          <span class="flex gap-0.5" aria-hidden="true">{#each deltaBoxes as color}<i class={`size-[7px] rounded-[1px] ${color === 'addition' ? 'bg-(--green)' : color === 'deletion' ? 'bg-(--red)' : 'bg-muted-foreground/20'}`}></i>{/each}</span>
          <Hint text={statusLabel}>
            {#snippet children({ props })}<span {...props} tabindex="-1" role="img" aria-label={statusLabel} data-file-status data-ui-control data-cursor="native" class={`ml-1 inline-flex size-6 shrink-0 cursor-default items-center justify-center rounded-[min(var(--radius-md),10px)] border border-border bg-muted text-xs dark:border-input ${status === 'A' ? 'text-(--green)' : status === 'D' ? 'text-(--red)' : 'text-foreground'}`}>{status}</span>{/snippet}
          </Hint>
          {#if gameEnabled && !reviewed && !celebration && !historical}
            <Hint text="Nuke file">
              {#snippet children({ props })}
                <Button {...mergeProps(props, { onclick: () => ondestruction?.(file) })} variant="outline" size="icon-xs"
                  class="file-nuke text-muted-foreground hover:border-warning/60 hover:bg-warning/10 hover:text-warning dark:hover:bg-warning/10 aria-pressed:border-warning/60 aria-pressed:bg-warning/10 aria-pressed:text-warning"
                  aria-label="Nuke file" aria-pressed={!!damage} disabled={!ondestruction || busy || combat?.paused}>
                  <svg class="size-4.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="12" cy="12" r="2" />
                    <path d="M8.5 12H2A10 10 0 0 1 7 3.34L10.25 8.97A3.5 3.5 0 0 0 8.5 12Z" />
                    <path d="M8.5 12H2A10 10 0 0 1 7 3.34L10.25 8.97A3.5 3.5 0 0 0 8.5 12Z" transform="rotate(120 12 12)" />
                    <path d="M8.5 12H2A10 10 0 0 1 7 3.34L10.25 8.97A3.5 3.5 0 0 0 8.5 12Z" transform="rotate(240 12 12)" />
                  </svg>
                </Button>
              {/snippet}
            </Hint>
          {/if}
          {#if reviewed}
            <Hint text="Reviewed · Click to reopen">
              {#snippet children({ props })}
                <Button {...mergeProps(props, { onclick: () => onreopen(file.path) })} variant="outline" size="icon-xs" class="file-reviewed bg-muted! text-(--green)" aria-label={`Reopen ${file.path} for review`}><Check /></Button>
              {/snippet}
            </Hint>
          {/if}
        </div>
      </div>
      {#if showVersions && historyExpanded}
        <ReviewRounds path={file.path} {entries} current={revisionIndex} overall={viewKind === 'head'} snapshot={findingSnapshot} {busy} loading={historyLoading}
          boxSize={config.display.revisionBoxSize} newer={historical && file.revision !== liveFile.revision}
          reminder={historical ? liveReminder : 0} reducedMotion={config.display.reducedMotion}
          onselect={chooseRound} onprevious={() => stepRevision(-1)} onnext={() => stepRevision(1)} onoverall={() => chooseView('head')} />
      {/if}
    </div>
    {#if !folded && fileComments.length}
      <div class="file-comments border-x border-border/50 px-2" aria-label="File comments">
        {#each fileComments as finding (finding.id)}
          <CommentThread {finding} {catalog} {reviewId} outOfView={!!finding.ranges} {onreply} {onresolve} {ondelete} {ondeletereply} onreopen={onreopencomment} onhistory={inspectHistory} {isCurrentRevision} />
        {/each}
      </div>
    {/if}
    <!-- Keep the placeholder's height until the diff has painted. Otherwise a
         one-frame collapse makes the browser clamp or anchor the page mid-jump. -->
    <div class="file-surface relative [clip-path:inset(var(--header-clip)_-100vw_-100vh)]" bind:this={body} aria-busy={file.patchPending || undefined} style:--header-clip={`${headerClip}px`} style:min-height={!folded && (file.patchPending || !ready || (hasDiff && !painted)) ? `${surfaceHeight}px` : undefined}>
      {#if !folded && !file.patchPending && (ready || contextLoaded)}
        {#if hasDiff}
          <DiffView {damage} {file} {diffCache} {reviewId} findings={renderedFindings} {catalog} {config} armed={armed && !historical && !busy} {lineSelection} selectionEnabled={!historical && !busy && !reviewed && !damage} {virtualizer} {onresolve} {ondelete} {onreply} {ondeletereply} {onreopencomment} onhistory={inspectHistory} {isCurrentRevision}
            inspectedFindingId={inspectedDiffFindingId} inspectionActive={!!inspectedFindingId} oninspect={(id, open) => changeInspection(id, 'diff', open)} onrelease={id => changeInspection(id, 'diff', false)}
            onrendered={() => painted = true} onmarkspace={space => lineMarkSpace = space} oncontext={(file, lineCounts) => expandedContext = { file, lineCounts }} onhidden={ids => { if (ids.join() !== hiddenFindings.join()) hiddenFindings = ids; }} />
        {:else}
          <div class="diff-surface" bind:this={placeholderSurface} data-destruction-panel>
            <div class="flex min-h-[190px] flex-col items-center justify-center gap-4 px-5 py-8 text-center text-muted-foreground [&>h3]:text-2xl [&>h3]:text-foreground [&>p]:max-w-[490px] [&>p]:text-sm">
              <FileCode size={30} />
              <h3>{file.binary ? 'Binary file' : file.omitted ? 'Preview unavailable' : file.patch ? 'Metadata change' : 'No changes'}</h3>
              <p>{file.omitted || (file.binary ? file.path : 'No text changes.')}</p>
            </div>
          </div>
        {/if}
      {:else if !folded}
        <div class="diff-placeholder diff-surface absolute inset-0 bg-[repeating-linear-gradient(transparent_0_25px,--alpha(var(--foreground)/1%)_25px_26px)]" aria-label="Loading diff">
          {#if file.patchPending}{@render loading?.()}{/if}
        </div>
      {/if}
    </div>

  </div>
</section>

<style>
  .destruction-active .file-statistics { flex: 1 1 0; justify-content: flex-end; }
  .file-target-position {
    transition-property: transform, width, height;
    transition-timing-function: cubic-bezier(.2, .8, .2, 1);
  }
</style>
