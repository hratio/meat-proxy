<script lang="ts">
  import { onMount } from 'svelte';
  import { LoaderCircle, Pause, Play, RotateCcw, RotateCw, Scan, Box } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import type { PreviewStatus, WeaponPreview } from '$lib/weapons/preview';

  let { url, name, thumbnail, reducedMotion = false }: {
    url: string; name: string; thumbnail?: string; reducedMotion?: boolean;
  } = $props();
  let canvas: HTMLCanvasElement;
  let preview = $state<WeaponPreview>();
  let status = $state<PreviewStatus>('loading');
  let autoRotate = $state(true);
  let systemReducedMotion = $state(false);
  let rotating = $derived(autoRotate && !reducedMotion && !systemReducedMotion);

  $effect(() => { void preview?.load(url); });
  $effect(() => { preview?.setAutoRotate(rotating); });

  onMount(() => {
    let disposed = false;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => { systemReducedMotion = motion.matches; };
    updateMotion();
    motion.addEventListener('change', updateMotion);
    // Paint the lightweight preview and finish the dialog transition before
    // asking the browser to create a WebGL context. Closing early skips it.
    const opened = async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => { setTimeout(resolve, 0); }));
      if (disposed) return;
      const animations = canvas.closest('[role="dialog"]')?.getAnimations() ?? [];
      await Promise.allSettled(animations.map(animation => animation.finished));
    };
    void Promise.all([import('$lib/weapons/preview'), opened()]).then(([{ createWeaponPreview }]) => {
      if (!disposed) preview = createWeaponPreview(canvas, next => { status = next; });
    }).catch(() => { if (!disposed) status = 'error'; });
    return () => { disposed = true; motion.removeEventListener('change', updateMotion); preview?.dispose(); };
  });

  function rotate(direction: number) { autoRotate = false; preview?.rotate(direction); }
</script>

<div class="relative isolate flex min-h-64 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#353d42]" data-preview-status={status}>
  <canvas bind:this={canvas} class="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing" style:opacity={status === 'ready' ? 1 : 0} aria-label={`3D preview of ${name}. Drag to rotate and scroll to zoom.`} data-asset={status === 'ready' ? url : undefined}></canvas>
  <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-linear-to-b from-black/25 to-transparent px-4 py-3 text-[10px] tracking-[.16em] text-white/50">
    <span>INSPECTION BAY</span><span class="flex items-center gap-1.5"><span class={`size-1.5 rounded-full ${status === 'ready' ? 'bg-emerald-200/70' : 'bg-white/30'}`}></span>LIVE 3D</span>
  </div>
  {#if status !== 'ready'}
    <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#30383d] p-6 text-center text-sm text-white/70" role="status" aria-live="polite">
      {#if thumbnail}<img src={thumbnail} alt="" class="max-h-44 w-full max-w-80 object-contain" />{:else}<Box class="size-10 text-white/40" />{/if}
      {#if status !== 'error'}
        <span class="flex items-center gap-2"><LoaderCircle class={reducedMotion || systemReducedMotion ? 'size-4' : 'size-4 animate-spin'} /><span>{status === 'preparing' ? 'Preparing 3D preview…' : `Loading ${name}…`}</span></span>
      {:else}
        <p>3D preview unavailable</p>
      {/if}
    </div>
  {/if}
  <div class="pointer-events-none relative mt-auto flex flex-wrap items-center justify-between gap-2 bg-linear-to-t from-black/50 to-transparent px-3 pt-10 pb-3">
    <span class="pl-1 text-[11px] text-white/55">Drag to rotate · Scroll to zoom</span>
    <div class="pointer-events-auto flex items-center gap-0.5 rounded-md border border-white/10 bg-black/30 p-0.5 text-white/75">
      <Button variant="preview" size="icon-sm" aria-label="Rotate weapon left" disabled={status !== 'ready'} onclick={() => rotate(-1)}><RotateCcw class="size-3.5" /></Button>
      <Button variant="preview" size="icon-sm" aria-label={rotating ? 'Pause rotation' : 'Resume rotation'} aria-pressed={rotating} disabled={status !== 'ready' || reducedMotion || systemReducedMotion} onclick={() => autoRotate = !autoRotate}>
        {#if rotating}<Pause class="size-3.5" />{:else}<Play class="size-3.5" />{/if}
      </Button>
      <Button variant="preview" size="icon-sm" aria-label="Rotate weapon right" disabled={status !== 'ready'} onclick={() => rotate(1)}><RotateCw class="size-3.5" /></Button>
      <span class="mx-1 h-4 w-px bg-white/15"></span>
      <Button variant="preview" size="icon-sm" aria-label="Reset weapon view" disabled={status !== 'ready'} onclick={() => preview?.reset()}><Scan class="size-3.5" /></Button>
    </div>
  </div>
</div>
