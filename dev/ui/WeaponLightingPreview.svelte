<script lang="ts">
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { RotateCcw, RotateCw, Scan } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { createModelLoader } from '$lib/models/loader';
  import { disposeWeapon, frameWeapon } from '$lib/weapons/runtime';
  import { loadPreviewEnvironment } from '$lib/weapons/preview-environment';
  import { createWeaponLighting } from '$lib/weapons/lighting';
  import type { WeaponLighting } from '$lib/weapons/lighting-config';

  let { url, lighting, exposure }: { url: string; lighting: WeaponLighting; exposure: number } = $props();
  let canvas: HTMLCanvasElement;
  let status = $state('loading');
  let load = $state.raw<(url: string) => void>();
  let update = $state.raw<(lighting: WeaponLighting, exposure: number) => void>();
  let rotate = $state.raw<(direction: number) => void>();
  let reset = $state.raw<() => void>();
  $effect(() => load?.(url));
  $effect(() => update?.(lighting, exposure));

  onMount(() => {
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); }
    catch { status = 'error'; return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    const rig = createWeaponLighting(renderer, scene);
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 30);
    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.minDistance = 1.4;
    controls.maxDistance = 9;
    const loader = createModelLoader();
    let model: THREE.Object3D | undefined;
    let disposed = false, lost = false, generation = 0, frame = 0, ready = false;

    // Coalesce dragging, resizing and slider input into one frame. No idle loop.
    const invalidate = () => {
      if (frame || disposed || lost || !ready || document.hidden) return;
      frame = requestAnimationFrame(() => { frame = 0; renderer.render(scene, camera); });
    };
    const environment = loadPreviewEnvironment().then(texture => {
      if (disposed || lost) texture.dispose();
      else scene.environment = texture;
      return true;
    }).catch(() => false);
    reset = () => {
      const distance = 2.65 * Math.max(1, 1.1 / camera.aspect);
      camera.position.set(-distance * .78, distance * .22, distance * .65);
      controls.target.set(0, 0, 0);
      controls.update(); invalidate();
    };
    rotate = direction => {
      camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * Math.PI / 8);
      controls.update(); invalidate();
    };
    update = (value, brightness) => { rig.update(value, brightness); invalidate(); };
    const resize = () => {
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix(); invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas); resize(); reset();
    controls.addEventListener('change', invalidate);
    document.addEventListener('visibilitychange', invalidate);
    const contextLost = (event: Event) => {
      event.preventDefault(); lost = true; ready = false; status = 'error';
      cancelAnimationFrame(frame); frame = 0;
    };
    canvas.addEventListener('webglcontextlost', contextLost);

    load = async modelUrl => {
      if (disposed || lost) return;
      const request = ++generation;
      ready = false; status = 'loading';
      if (model) { scene.remove(model); disposeWeapon(model); model = undefined; }
      const current = () => !disposed && !lost && request === generation;
      try {
        const asset = (await loader.loadAsync(modelUrl)).scene;
        if (!current()) { disposeWeapon(asset); return; }
        model = frameWeapon(asset); scene.add(model); reset?.();
        if (!await environment) throw new Error('Lighting environment unavailable');
        if (!current()) return;
        await renderer.compileAsync(scene, camera);
        if (!current()) return;
        ready = true; status = 'ready'; invalidate();
      } catch { if (current()) status = 'error'; }
    };
    return () => {
      disposed = true; generation++;
      load = undefined; update = undefined; rotate = undefined; reset = undefined;
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      document.removeEventListener('visibilitychange', invalidate);
      canvas.removeEventListener('webglcontextlost', contextLost);
      rig.dispose(); disposeWeapon(scene); scene.environment?.dispose();
      renderer.dispose(); if (!lost) renderer.forceContextLoss();
    };
  });
</script>

<div class="lighting-preview bg-[radial-gradient(ellipse_at_50%_45%,#242a2e,#101316_75%)] relative isolate h-44 overflow-hidden rounded-lg border border-border" data-lighting-preview={status}>
  <canvas bind:this={canvas} class="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing" class:invisible={status !== 'ready'} aria-label="Weapon lighting preview. Drag to rotate; scroll to zoom."></canvas>
  <div class="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-3 py-2 font-mono text-[9px] tracking-widest text-muted-foreground">
    <span>LIGHTING DESK</span><span class="flex items-center gap-1.5"><span class="size-1 rounded-full bg-primary"></span>LIVE</span>
  </div>
  {#if status !== 'ready'}<p class="absolute inset-0 grid place-content-center px-4 text-center text-xs text-muted-foreground" role="status">{status === 'error' ? '3D preview unavailable. Lighting controls and export still work.' : 'Preparing weapon…'}</p>{/if}
  <div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-background/90 to-transparent px-3 pt-5 pb-2">
    <span class="text-[10px] text-muted-foreground">Drag to inspect</span>
    <div class="pointer-events-auto flex gap-1">
      <Button variant="ghost" size="icon-sm" aria-label="Turn lighting preview left" disabled={status !== 'ready'} onclick={() => rotate?.(-1)}><RotateCcw class="size-3.5" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Turn lighting preview right" disabled={status !== 'ready'} onclick={() => rotate?.(1)}><RotateCw class="size-3.5" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Reset lighting preview view" disabled={status !== 'ready'} onclick={() => reset?.()}><Scan class="size-3.5" /></Button>
    </div>
  </div>
</div>
