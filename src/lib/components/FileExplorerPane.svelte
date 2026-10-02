<script lang="ts">
  import { onMount, untrack, type Snippet } from 'svelte';
  import { mergeProps } from 'bits-ui';
  import Hint from './Hint.svelte';

  let { sidebarLeft, visible, children }: { sidebarLeft: boolean; visible: boolean; children: Snippet<[Snippet]> } = $props();
  const storageKey = 'meat-proxy:explorer-width:v1';
  let pane: HTMLElement;
  let preferredWidth = $state<number>();
  let bounds = $state({ min: 0, max: 0, width: 0 });
  let dragging = $state(false);
  let gesture: { pointerId: number; handle: HTMLElement; x: number; width: number; preferred?: number; direction: number; min: number; max: number; moved?: boolean } | undefined;

  function measure() {
    if (!pane) return;
    const rail = pane.parentElement!.getBoundingClientRect();
    // Reserve the entire 24px grip outside the tree, including at small insets.
    const inset = Math.max(24, parseFloat(getComputedStyle(pane).getPropertyValue('--chrome-inset')) || 0);
    const max = Math.max(0, sidebarLeft ? rail.right - inset : innerWidth - rail.left - inset);
    bounds = { min: Math.min(rail.width, max), max, width: pane.getBoundingClientRect().width };
  }

  function persist() {
    try {
      if (preferredWidth === undefined) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(preferredWidth));
    } catch { /* Resizing still works when browser storage is unavailable. */ }
  }

  function finish(cancelled = false) {
    if (!gesture) return;
    const previous = gesture;
    gesture = undefined;
    dragging = false;
    if (cancelled) preferredWidth = previous.preferred;
    if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
    if (!cancelled) persist();
  }

  function pointerDown(event: PointerEvent) {
    if (gesture || event.button !== 0 || !event.isPrimary) return;
    measure();
    const handle = event.currentTarget as HTMLElement;
    gesture = { pointerId: event.pointerId, handle, x: event.clientX, width: bounds.width, preferred: preferredWidth, direction: sidebarLeft ? -1 : 1, min: bounds.min, max: bounds.max };
    dragging = true;
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function pointerMove(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const delta = (event.clientX - gesture.x) * gesture.direction;
    // A click must not replace a saved wide preference with a temporary clamp.
    gesture.moved ||= delta !== 0;
    if (gesture.moved) preferredWidth = Math.max(gesture.min, Math.min(gesture.max, gesture.width + delta));
    event.preventDefault();
    event.stopPropagation();
  }

  function pointerUp(event: PointerEvent) {
    if (gesture?.pointerId !== event.pointerId) return;
    pointerMove(event);
    finish();
  }

  function cancelPointer(event: PointerEvent) {
    if (gesture?.pointerId === event.pointerId) finish(true);
  }

  function reset() {
    finish(true);
    preferredWidth = undefined;
    persist();
  }

  function keydown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'Enter'].includes(event.key) || gesture) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Home' || event.key === 'Enter') { reset(); return; }
    measure();
    const delta = (event.key === 'ArrowRight' ? 1 : -1) * (sidebarLeft ? -1 : 1) * (event.shiftKey ? 50 : 10);
    preferredWidth = Math.max(bounds.min, Math.min(bounds.max, bounds.width + delta));
    persist();
  }

  // Switching sides or hiding the explorer cancels an in-flight drag.
  $effect(() => { void sidebarLeft; void visible; untrack(() => finish(true)); });

  onMount(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0) preferredWidth = saved;
    } catch { /* Use the normal sidebar width if storage is unavailable. */ }
    const cancel = () => finish(true);
    const resize = () => { cancel(); measure(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !gesture) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    observer.observe(pane.parentElement!);
    window.addEventListener('resize', resize);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape, true);
    return () => {
      cancel();
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape, true);
    };
  });
</script>

<section id="file-explorer" class="explorer-pane relative flex min-h-[120px] flex-1 flex-col bg-transparent p-0" class:sidebar-left={sidebarLeft} class:dragging aria-label="Files" bind:this={pane}
  style:--explorer-preferred-width={preferredWidth === undefined ? undefined : `${preferredWidth}px`}>
  {#snippet resizeHandle()}
    {#if visible}
      <Hint text="Drag to resize · Double-click to reset" side={sidebarLeft ? 'right' : 'left'} disabled={dragging}>
        {#snippet children({ props })}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (This is a focusable window splitter with arrow-key resizing.) -->
          <div {...mergeProps(props, { onpointerdown: pointerDown, onpointermove: pointerMove, onpointerup: pointerUp, onpointercancel: cancelPointer, onlostpointercapture: cancelPointer, onkeydown: keydown, ondblclick: reset, onfocus: measure })}
            class="explorer-resize pointer-events-auto absolute grid place-items-center rounded-md text-muted-foreground/50 hover:bg-muted/40 hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring" class:sidebar-left={sidebarLeft} class:dragging
            data-explorer-resize data-cursor="native" role="separator" tabindex="0" aria-label="Resize file tree" aria-orientation="vertical" aria-controls="file-explorer"
            aria-valuemin={Math.round(bounds.min)} aria-valuemax={Math.round(bounds.max)} aria-valuenow={Math.round(bounds.width)} aria-valuetext={`${Math.round(bounds.width)} pixels`}>
            <span class="grip pointer-events-none grid grid-cols-2 gap-[3px]" aria-hidden="true">
              {#each Array(6) as _}<span class="size-0.5 rounded-full bg-current"></span>{/each}
            </span>
          </div>
        {/snippet}
      </Hint>
    {/if}
  {/snippet}
  {@render children(resizeHandle)}
</section>

<style>
  .explorer-pane {
    --explorer-edge-inset: max(24px, var(--chrome-inset));
    --explorer-max-width: max(0px, calc(100vw - var(--rail-left) - var(--explorer-edge-inset)));
    align-self: flex-start;
    min-width: min(var(--rail-width), var(--explorer-max-width));
    width: var(--explorer-preferred-width, var(--rail-width));
    max-width: var(--explorer-max-width);
  }
  .explorer-pane.sidebar-left {
    --explorer-max-width: max(0px, calc(var(--rail-left) + var(--rail-width) - var(--explorer-edge-inset)));
    align-self: flex-end;
  }
  .explorer-resize {
    left: 100%;
    top: 50%;
    width: 24px;
    height: 56px;
    transform: translateY(-50%);
    touch-action: none;
    user-select: none;
  }
  .explorer-resize.sidebar-left { left: auto; right: 100%; }
  .explorer-resize.dragging { color: var(--muted-foreground); background: color-mix(in srgb, var(--muted) 40%, transparent); }
</style>
