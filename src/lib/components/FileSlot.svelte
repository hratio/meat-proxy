<script lang="ts">
  import { onMount, untrack, type ComponentProps } from 'svelte';
  import type { TransitionConfig } from 'svelte/transition';
  import { observeFile } from '$lib/file-viewport';
  import { queueDiffRender } from '$lib/render-queue';
  import type { FilePatches, FilePatch } from '$lib/file-patches';
  import type { FileSectionState } from '$lib/file-section-state';
  import { Button } from '$lib/components/ui/button';
  import FileSection from './FileSection.svelte';

  let { filePatches, file, config, scrollRoot, register, exit = () => ({ duration: 0 }), onexit, ...props }: ComponentProps<typeof FileSection> & {
    filePatches: FilePatches; exit?: (node: HTMLElement) => TransitionConfig; onexit?: () => void;
  } = $props();
  let element: HTMLDivElement;
  let loaded = $state.raw<{ key: string; value: FilePatch }>();
  let failure = $state(''), retry = $state(0), priority = 0;
  let resolvedFile = $derived.by(() => {
    const cached = loaded, current = file;
    if (!current.patchPending) return current;
    return cached?.key === current.patchKey && cached
      ? { ...current, patch: cached.value.file.patch, patchPending: false } : undefined;
  });
  $effect(() => {
    if (!(active || retained)) { loaded = undefined; return; }
    if (!file.patchPending) return;
    const key = file.patchKey!;
    retry;
    const controller = new AbortController();
    failure = '';
    void filePatches.load(file, props.reviewId, controller.signal, priority).then(value => {
      if (!controller.signal.aborted && file.patchKey === key) loaded = { key, value };
    }).catch(error => { if (!controller.signal.aborted) failure = error.message; });
    return () => controller.abort();
  });
  // The selected file is already visible. Its header must not wait for an
  // intersection callback, a render-queue frame, or the patch request.
  let active = $state(untrack(() => config.display.fileView === 'single')), retained = $state(false);
  let saved = $state.raw<FileSectionState>();
  let reveal: (() => void) | undefined, revealPending = false;
  let toggle: (() => void) | undefined;
  let measured = $state<{ key: string; height: number }>();
  let key = $derived(`${file.revision}:${file.comparison?.base}:${file.comparison?.head}:${config.display.diffStyle}:${config.display.lineHeight}`);
  // Only metadata is needed for distant files. Exact heights are retained after
  // visiting; patch parsing and full controls belong to the visible section.
  let rows = $derived(config.display.diffStyle === 'split' ? Math.max(file.additions, file.deletions) : file.additions + file.deletions);
  let height = $derived(measured?.key === key ? measured.height : 100 + (rows ? (rows + config.review.contextLines * 2 + 2) * config.display.lineHeight + 16 : 220));

  const attach = (_path: string, _element: HTMLElement, expand: () => void, toggleCollapsed: () => void) => {
    reveal = expand;
    toggle = toggleCollapsed;
    if (revealPending) { revealPending = false; expand(); }
    return () => { reveal = undefined; toggle = undefined; };
  };

  onMount(() => {
    let cancel = () => {};
    const unregister = register(file.path, element, () => {
      cancel(); active = true;
      if (reveal) reveal(); else revealPending = true;
    }, () => toggle?.());
    const unobserve = observeFile(element, scrollRoot, config.review.renderAheadPx, entry => {
      cancel();
      if (entry.isIntersecting) {
        priority = Math.max(0, entry.boundingClientRect.top - ((entry.rootBounds?.bottom || 0) - config.review.renderAheadPx), (entry.rootBounds?.top || 0) + config.review.renderAheadPx - entry.boundingClientRect.bottom);
        cancel = queueDiffRender(() => { active = true; }, config.review.renderBatchSize, priority);
      } else {
        if (active) measured = { key, height: element.offsetHeight };
        active = false;
      }
    });
    return () => { cancel(); unobserve(); unregister(); };
  });
</script>

<div class="file-slot flow-root last:min-h-[max(0px,calc(100dvh-var(--review-ceiling)-var(--review-tail)))]" bind:this={element} out:exit|global onoutroend={onexit}>
  {#if active || retained}
    <FileSection {...props} viewActive={active} file={resolvedFile || file} historyEntries={loaded && loaded.key === file.patchKey && JSON.stringify(loaded.value.file.live) === JSON.stringify(file.live) ? loaded.value.entries : undefined} {config} {scrollRoot} register={attach} initialState={saved} onsuspend={state => saved = { ...state, override: undefined }} onretain={value => retained = value}>
      {#snippet loading()}
        <div class="p-4 text-xs text-muted-foreground">
          {#if failure}<p role="alert">{failure} <Button variant="outline" size="sm" onclick={() => retry++}>Retry loading diff</Button></p>{:else}<p role="status">Loading diff…</p>{/if}
        </div>
      {/snippet}
    </FileSection>
  {:else}
    <section class="review-file file-placeholder box-border py-3 text-xs text-muted-foreground" data-file-path={file.path} aria-label={file.path} aria-busy="true" style:height={`${height}px`}>
      <span>{file.path}</span>
    </section>
  {/if}
</div>
