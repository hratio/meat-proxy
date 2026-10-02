<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { createModelLoader } from '$lib/models/loader';
  import { standaloneModel } from '$lib/models/download';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { weaponCatalog } from '$lib/weapons/catalog';
  import { createWeaponMotion, disposeWeapon, frameWeapon, lightWeaponScene, type WeaponMotion } from '$lib/weapons/runtime';
  import { createWeaponEffects } from '$lib/weapons/effects';
  import { weaponEffectsSchema, weaponProfile } from '$lib/weapons/profiles';
  import { defaults } from '$lib/config';
  import { createWeaponCharge, type WeaponCharge } from '$lib/weapons/charge';

  let selected = $state(0);
  const weapon = $derived(weaponCatalog[selected]);
  const profile = $derived(weaponProfile(weapon.url, defaults.weapons.profiles));
  let canvas: HTMLCanvasElement;
  let ready = $state('');
  let error = $state('');
  let downloading = $state(false), downloadError = $state('');
  let downloadController: AbortController | undefined;
  let autoRotate = $state(false);
  let wireframe = $state(false);
  let firstPerson = $state(false);
  let firing = $state(false);
  let charge: WeaponCharge | undefined;
  let shot = -10000, shotCharge = 0;
  let reloadAt = 0;
  let loadAsset = $state<((url: string) => void) | undefined>();
  let setView = $state<((fps: boolean) => void) | undefined>();
  let setWireframe = $state<((enabled: boolean) => void) | undefined>();
  $effect(() => { loadAsset?.(weapon.url); });
  $effect(() => { setView?.(firstPerson); });
  $effect(() => { setWireframe?.(wireframe); });

  function startFire() {
    if (firing || !ready) return;
    firing = true;
    charge = profile.effect === 'plasma' ? createWeaponCharge(profile, performance.now()) : undefined;
  }
  function stopFire(release = true) {
    if (charge) {
      if (release && firing) {
        const time = performance.now(), level = charge.release(time);
        if (level !== undefined && time - shot >= (profile.fireIntervalMs ?? 110) && time - reloadAt >= 1400) { shotCharge = level; shot = time; }
      } else charge.cancel();
      charge = undefined;
    }
    firing = false;
  }

  async function download() {
    if (downloading) return;
    const asset = weapon;
    downloading = true; downloadError = '';
    downloadController = new AbortController();
    try {
      const blob = await standaloneModel(asset.url, downloadController.signal);
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${asset.id}.glb`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) {
      if (!downloadController.signal.aborted) downloadError = cause instanceof Error ? cause.message : 'Download failed.';
    } finally { downloading = false; }
  }

  onMount(() => {
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch { error = 'WebGL is unavailable. You can still download every GLB below.'; return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    const scene = new THREE.Scene();
    const disposeEnvironment = lightWeaponScene(renderer, scene);
    const camera = new THREE.PerspectiveCamera(35, 1, .01, 50);
    const effectsConfig = weaponEffectsSchema.parse({});
    const effects = createWeaponEffects(scene, camera, () => effectsConfig);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.minDistance = 1.2; controls.maxDistance = 7;
    const key = new THREE.DirectionalLight(0xffe9d1, 3.5); key.position.set(2, 4, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ccfff, 3); rim.position.set(-2, 2, -3); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 1.5); fill.position.set(3, 1, -3); scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xb7d1df, 0x2b2120, 1.1));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let model: THREE.Object3D | undefined, motion: WeaponMotion | undefined;
    let frame = 0, disposed = false, generation = 0, last = 0;
    const loader = createModelLoader();
    const view = (fps: boolean) => {
      effects.clear();
      controls.enabled = !fps;
      controls.target.set(0, 0, 0);
      const detailedSide = model?.getObjectByName('Weapon')?.userData.primaryHand === 'right' ? -2 : 2;
      camera.position.set(...(fps ? [0, .1, 2.55] : [detailedSide, 1.25, -2.2]) as [number, number, number]);
      if (model) model.position.set(fps ? .34 : 0, fps ? -.35 : 0, fps ? .18 : 0);
      camera.lookAt(0, 0, 0); controls.update();
    };
    setView = view;
    const setWire = (enabled: boolean) => {
      model?.traverse(node => {
        if (node instanceof THREE.Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (material instanceof THREE.MeshStandardMaterial) material.wireframe = enabled;
        }
      });
    };
    setWireframe = setWire;
    loadAsset = async url => {
      stopFire(false);
      const request = ++generation; ready = ''; error = '';
      try {
        const gltf = await loader.loadAsync(url);
        if (disposed || request !== generation) { disposeWeapon(gltf.scene); return; }
        effects.unmount(0);
        if (model) { scene.remove(model); disposeWeapon(model); }
        model = frameWeapon(gltf.scene); scene.add(model);
        motion = createWeaponMotion(gltf.scene, -1, () => profile);
        shot = -10000; shotCharge = 0;
        effects.mount(0, model, gltf.scene, profile);
        view(firstPerson); setWire(wireframe);
        ready = url;
      } catch (cause) { if (!disposed && request === generation) error = `Could not load this model: ${String(cause)}`; }
    };
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); view(false);
    const keyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input, select, textarea, [contenteditable="true"]')) return;
      motion?.keyDown(event.code, performance.now());
      if (weapon.id === 'daz-ratatat' && !event.ctrlKey && !event.metaKey && !event.altKey) shot = performance.now();
    };
    const keyUp = (event: KeyboardEvent) => motion?.keyUp(event.code);
    const release = () => { stopFire(); motion?.releaseKeys(); };
    const cancel = () => { stopFire(false); motion?.releaseKeys(); };
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('pointerup', release);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    const render = (time: number) => {
      frame = requestAnimationFrame(render);
      if (document.hidden) { last = time; return; }
      const delta = Math.min(time - last, 100); last = time;
      if (firing && !charge && time - shot > (profile.fireIntervalMs ?? 110)) { shot = time; shotCharge = 0; }
      const level = charge?.level(time) ?? 0;
      motion?.update(time, delta, shot, firing, Math.max(0, 1 - (time - reloadAt) / 1400), reducedMotion.matches, level, reloadAt);
      controls.autoRotate = autoRotate && !firstPerson && !reducedMotion.matches;
      controls.autoRotateSpeed = .65; controls.update(delta / 1000);
      effects.update(time, delta, [shot], [true], 45, reducedMotion.matches, undefined, [shotCharge], [level]);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(render);
    return () => {
      downloadController?.abort();
      disposed = true; generation++; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      stopFire(false);
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('pointerup', release); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibility);
      effects.dispose(); disposeWeapon(scene); disposeEnvironment(); renderer.dispose();
    };
  });
</script>

<svelte:head><title>Armory · Meat Proxy</title><meta name="description" content="Original Meat Proxy weapons. Inspect, animate, and download the Three.js-ready 3D models." /></svelte:head>

<main class="armory min-h-dvh bg-[radial-gradient(ellipse_at_65%_30%,var(--secondary)_0,var(--background)_60%)] px-[4vw] font-sans text-foreground">
  <header class="flex h-[86px] items-center justify-between gap-5 border-b border-border">
    <a class="text-[21px] font-extrabold tracking-tight [&_span]:ml-3.5 [&_span]:text-[13px] [&_span]:font-normal [&_span]:tracking-widest [&_span]:text-muted-foreground max-[650px]:[&_span]:hidden" href="/">MEAT PROXY <span>/ ARMORY</span></a>
    <span class="font-mono text-[10px] tracking-widest text-muted-foreground max-[900px]:hidden">FIELD EQUIPMENT · SERIES 01</span>
    <a class="font-mono text-[10px] tracking-widest text-muted-foreground hover:text-primary" href="/">Back to the arena ↗</a>
  </header>
  <section class="grid min-h-[570px] grid-cols-[340px_minmax(0,1fr)] gap-6 min-[1700px]:min-h-[650px] max-[900px]:grid-cols-[250px_minmax(0,1fr)] max-[900px]:gap-0 max-[650px]:flex max-[650px]:flex-col-reverse">
    <div class="z-1 self-center pt-[62px] pb-[38px] max-[650px]:w-full max-[650px]:pt-3 max-[650px]:pb-7.5">
      <p class="flex items-center gap-2 text-xs leading-normal tracking-wide text-muted-foreground"><span class="size-1.25 rounded-full bg-primary"></span> {String(selected + 1).padStart(2, '0')} / {weaponCatalog.length} · {weapon.type}</p>
      <h1 class="my-6 font-[family-name:var(--hud-font)] text-[clamp(48px,4.5vw,76px)] leading-[.95] font-extrabold tracking-tight uppercase max-[650px]:text-5xl">{weapon.name}</h1>
      <p class="max-w-[310px] text-[13px] leading-relaxed text-muted-foreground max-[650px]:max-w-none">{weapon.description}</p>
      <div class="my-8 flex gap-6 border-y border-border py-5 [&>div]:flex [&>div]:flex-col [&>div]:gap-2 [&_strong]:text-[17px] [&_strong]:font-medium [&_span]:font-mono [&_span]:text-[8px] [&_span]:tracking-wide [&_span]:text-muted-foreground max-[900px]:gap-4 max-[650px]:my-5"><div><strong>{(weapon.triangles / 1000).toFixed(1)}K</strong><span>TRIANGLES</span></div><div><strong>{(weapon.downloadBytes / 1000000).toFixed(2)} MB</strong><span>FIRST DOWNLOAD</span></div><div><strong>{weapon.drawCalls}</strong><span>DRAW CALLS</span></div></div>
      <Button size="lg" class="w-full max-w-[245px] justify-between" onclick={download} disabled={downloading}>{downloading ? 'Preparing download…' : 'Download GLB'} <span>↓</span></Button>
      {#if downloadError}<p role="alert">{downloadError}</p>{/if}
      <p class="mt-3.5 text-[9px] text-muted-foreground">Original geometry · PBR materials · Moving parts</p>
    </div>
    <div class="relative min-h-[570px] min-w-0 min-[1700px]:min-h-[650px] max-[650px]:min-h-[370px]">
      <div class="pointer-events-none absolute top-7.5 right-0 left-5 z-1 flex justify-between font-mono text-[9px] tracking-widest text-muted-foreground [&_span]:text-foreground max-[650px]:left-0">{firstPerson ? '01 / FIRST PERSON' : '01 / INSPECTION'} <span>LIVE 3D</span></div>
      <canvas class="absolute inset-0 block size-full touch-none" bind:this={canvas} data-asset={ready} aria-label={`Interactive 3D model of ${weapon.name}`}></canvas>
      {#if error}<p class="absolute top-[45%] w-full text-center text-xs text-destructive" role="alert">{error}</p>{:else if !ready}<p class="absolute top-[45%] w-full text-center text-xs text-muted-foreground">Loading model…</p>{/if}
      <div class="pointer-events-none absolute bottom-[68px] w-full text-center font-mono text-[10px] text-muted-foreground">{weapon.id === 'daz-ratatat' ? 'Type or hold fire to launch keycaps' : profile.effect === 'plasma' ? 'Tap for an energy bolt · Hold to charge · Release to fire' : 'Drag to orbit · Scroll to inspect'}</div>
      <div class="absolute bottom-5.5 flex w-full flex-wrap justify-center gap-1">
        <Button variant="outline" selected={firing} onpointerdown={event => { event.currentTarget.setPointerCapture(event.pointerId); startFire(); }} onpointerup={() => stopFire()} onpointercancel={() => stopFire(false)} onkeydown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); startFire(); } }} onkeyup={event => { if (event.key === ' ' || event.key === 'Enter') stopFire(); }} onblur={() => stopFire(false)}>{profile.effect === 'plasma' ? 'Hold to charge' : 'Hold to fire'}</Button>
        <Button variant="outline" onclick={() => { stopFire(false); reloadAt = performance.now(); }}>Reload</Button>
        <Button variant="outline" selected={autoRotate} aria-pressed={autoRotate} onclick={() => autoRotate = !autoRotate}>Turntable</Button>
        <Button variant="outline" selected={firstPerson} aria-pressed={firstPerson} onclick={() => firstPerson = !firstPerson}>First person</Button>
        <Button variant="outline" selected={wireframe} aria-pressed={wireframe} onclick={() => wireframe = !wireframe}>Wireframe</Button>
      </div>
    </div>
  </section>
  <nav class="grid grid-cols-5 gap-2 border-t border-border pt-3.5 pb-7 max-[650px]:grid-cols-2 [&_img]:block [&_img]:h-[85px] [&_img]:w-full [&_img]:object-cover [&_strong]:my-1 [&_strong]:block [&_strong]:text-xs [&_strong]:font-semibold max-[900px]:[&_img]:h-[65px]" aria-label="Choose a weapon">
    {#each weaponCatalog as item, i}
      <Button variant="outline" size="card" class="relative min-w-0 flex-col items-stretch" selected={selected === i} aria-pressed={selected === i} onclick={() => { stopFire(false); selected = i; }}>
        <span class="absolute top-3 left-3 font-mono text-[9px] text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
        <img src={`/armory/${item.id}.webp`} alt="" loading="lazy" />
        <strong>{item.name}</strong><span class="block text-[9px] text-muted-foreground max-[900px]:hidden">{item.type}</span>
      </Button>
    {/each}
  </nav>
  <footer class="flex justify-between gap-4 pb-6 font-mono text-[9px] text-muted-foreground max-[650px]:flex-wrap"><span>BUILT FOR THE REVIEW ARENA.</span><a href="/__dev/audio">Compare weapon sounds ↗</a><span>Choose your loadout in Settings → Display.</span><a href="/models/weapons/manifest.json" download>Asset manifest ↗</a></footer>
</main>
