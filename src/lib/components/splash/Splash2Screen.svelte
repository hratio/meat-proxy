<script lang="ts">
  import { onMount, untrack, tick as flush } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { resolveSplashConfig } from './playback-config';
  import { resolveSplash2Config, splash2Durations, type Splash2Options, type Splash2LayerName } from './splash2-playback-config';
  import { splash2Artwork, splash2Portraits, splash2PaintLayers, splash2RingClips } from './splash2-assets';
  import { sampleSplash2 } from './splash2-timeline';
  import SplashLandscape from './SplashLandscape.svelte';

  let {
    config = {}, loop = false, paused = false, externalClock = false, time = $bindable(0), sceneTime = time, reducedMotion,
    hiddenLayers = [], showArtwork = true, landscape = true, artworkSources = {},
    onready, onassembled, oncomplete, onerror, onscenestatus
  }: {
    config?: Splash2Options;
    loop?: boolean;
    paused?: boolean;
    /** The opening player supplies the shared audio/visual playhead. */
    externalClock?: boolean;
    /** Bind for seeking. Set to zero to replay. */
    time?: number;
    /** Separate from title/audio seeking, so skipping never teleports the drive. */
    sceneTime?: number;
    reducedMotion?: boolean;
    hiddenLayers?: Splash2LayerName[];
    /** Decoded authoring previews; playback defaults to the prepared WebPs. */
    artworkSources?: Partial<Record<Splash2LayerName, string>>;
    showArtwork?: boolean;
    /** Set false when the parent owns the shared landscape. */
    landscape?: boolean;
    onready?: () => void;
    onassembled?: () => void;
    oncomplete?: () => void;
    onerror?: (error: Error) => void;
    onscenestatus?: (status: 'loading' | 'ready' | 'fallback') => void;
  } = $props();
  let root: HTMLDivElement;
  let ready = $state(false), failed = $state(false);
  let settings = $derived(resolveSplash2Config(config));
  let portrait = $derived(settings.portrait);
  let durations = $derived(splash2Durations(settings));
  let reduce = $derived(reducedMotion ?? prefersReducedMotion.current);
  let frame = $derived(sampleSplash2(time, settings, loop, reduce));
  let scene = $derived(resolveSplashConfig({ landscape: { speed: settings.scene.speed, opacity: settings.scene.opacity, fadeInMs: settings.scene.fadeInMs, fadeOutMs: settings.scene.fadeOutMs } }).landscape);
  let sceneOpacity = $derived(loop && !reduce && time >= durations.complete
    ? Math.max(0, 1 - (time - durations.complete) / Math.max(1, scene.fadeOutMs)) : 1);

  // Decode the selected portrait as well as the assembly. Changing portrait
  // retains the playhead and cannot flash an undecoded frame in the preview.
  $effect(() => {
    portrait;
    let disposed = false;
    ready = failed = false;
    void flush().then(() => Promise.all(Array.from(root.querySelectorAll('.splash2-layer img'), image => (image as HTMLImageElement).decode())))
      .then(() => { if (!disposed) { ready = true; onready?.(); } })
      .catch(() => { if (!disposed) { failed = true; onerror?.(new Error('A Splash 2 image could not be loaded.')); } });
    return () => { disposed = true; };
  });

  let externalCompleted = false, externalAssembled = false;
  $effect(() => {
    if (!externalClock) return;
    const sampledTime = reduce ? time + durations.assembled : time;
    if (sampledTime < durations.complete) externalCompleted = false;
    if (sampledTime < durations.assembled) externalAssembled = false;
    if (!ready || !showArtwork || paused || document.hidden) return;
    if (sampledTime >= durations.assembled && !externalAssembled) {
      externalAssembled = true; untrack(() => onassembled?.());
    }
    if (sampledTime >= durations.complete && !externalCompleted) {
      externalCompleted = true; untrack(() => oncomplete?.());
    }
  });

  onMount(() => {
    // The opening player owns its clock beyond the artwork's outro. Reactive
    // notifications stop with this view, instead of reading props from a
    // detached view while its transition is still painting.
    if (externalClock) return;
    let request = 0, previous = 0, completed = false, assembled = false;
    function tick(now: number) {
      const delta = previous ? Math.min(64, now - previous) : 0;
      previous = now;
      if (time < durations.complete) completed = false;
      if (time < durations.assembled) assembled = false;
      if (ready && showArtwork && !paused && !document.hidden) {
        if (reduce) time = Math.min(durations.complete, Math.max(time, durations.assembled) + delta);
        else if (loop) time += delta;
        else time = Math.min(durations.complete, time + delta);
        if (time >= durations.assembled && !assembled) { assembled = true; onassembled?.(); }
        if (time >= durations.complete && !completed) { completed = true; oncomplete?.(); }
        if (loop && !reduce && time >= durations.cycle) { time %= durations.cycle; completed = assembled = false; }
      }
      request = requestAnimationFrame(tick);
    }
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  });
</script>

<div class="splash-screen splash2-screen" class:standalone={landscape} bind:this={root} data-ready={ready} data-reduced-motion={reduce} data-loop={loop} data-portrait={portrait}
  role="img" aria-label="Meat Proxy — Hostile Review. Looks good to me." aria-busy={!ready && !failed}>
  {#if landscape && settings.scene.enabled}
    <div class="landscape" style:opacity={sceneOpacity}>
      <SplashLandscape {paused} time={sceneTime} settings={scene} reducedMotion={reduce} onstatus={onscenestatus} />
    </div>
  {/if}
  <div class="composition" style:translate={`0 ${frame.y}%`} style:opacity={ready && showArtwork ? frame.opacity : 0}>
    {#each splash2PaintLayers as { name, section }}
      {@const art = splash2Artwork[name]}
      {@const person = splash2Portraits[portrait]}
      <div class="splash2-layer" data-layer={name} data-ring-section={section}
        style:opacity={hiddenLayers.includes(name) ? 0 : frame.layers[name].opacity} style:transform={frame.layers[name].transform}>
        <img src={artworkSources[name] ?? (name === 'dude' ? person.src : art.src)} alt="" aria-hidden="true" draggable="false" decoding="async" loading="eager"
          width={name === 'dude' ? person.width : art.pixelWidth} height={name === 'dude' ? person.height : art.pixelHeight}
          style:left={`${art.left}%`} style:top={`${art.top}%`} style:width={`${art.width}%`}
          style:clip-path={section && (name === 'firstRing' || name === 'secondRing') ? splash2RingClips[name][section] : undefined} />
      </div>
    {/each}
  </div>
  {#if failed}<span class="load-error">Splash artwork could not be loaded.</span>{/if}
</div>

<style>
  .splash2-screen { position: relative; isolation: isolate; width: 100%; height: 100%; min-height: 0; display: grid; place-items: center; overflow: hidden; }
  .splash2-screen.standalone { background: var(--splash-background, #080908); }
  .landscape { position: absolute; inset: 0; pointer-events: none; }
  .composition { position: relative; width: min(94%, 1200px); aspect-ratio: 1536 / 1024; }
  @supports (width: 1cqh) { .splash2-screen { container-type: size; } .composition { width: min(94cqw, 141cqh, 1200px); } }
  .splash2-layer { position: absolute; inset: 0; transform-origin: 50% 50%; will-change: transform, opacity; pointer-events: none; }
  .splash2-layer img { position: absolute; display: block; height: auto; max-width: none; pointer-events: none; user-select: none; }
  /* Feather the fortress base before its source silhouette ends around 95%.
     Mask the image itself so the fade follows its entrance and shared drift. */
  .splash2-layer[data-layer='background'] img {
    mask-image: linear-gradient(to bottom, #000 82%, rgb(0 0 0 / .85) 85%, rgb(0 0 0 / .4) 88%, rgb(0 0 0 / .08) 91%, transparent 93%);
    mask-mode: alpha;
  }
  .load-error { position: absolute; bottom: 20px; color: #bfa390; font-size: 12px; }
</style>
