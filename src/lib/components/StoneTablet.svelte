<script lang="ts">
  import { assetUrl } from '$lib/asset-url';
  import { onMount } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import type { Config } from '$lib/config';
  import { getTargetArtwork } from '$lib/targets/artwork';
  import type { TabletCelebration } from '$lib/types';

  let { config, celebration, cleared = false, hovered = false, anticipating = false }: { config: Config; celebration?: TabletCelebration; cleared?: boolean; hovered?: boolean; anticipating?: boolean } = $props();
  const maskId = $props.id();
  const appearance = $derived(getTargetArtwork(config.targets.artwork));
  let host: HTMLDivElement;
  let model = $state<HTMLDivElement>();
  let visible = $state(false);
  let playback = $state.raw<{ animation: Animation; startedAt?: number }>();
  let lastPose: string | undefined;
  let settings = $derived(config.targets);
  let glowing = $derived(cleared || !!celebration);
  let reduced = $derived(config.display.reducedMotion || prefersReducedMotion.current);
  // Keep the original model-space tuning meaningful at any configured size.
  let unit = $derived(config.display.fileTargetSize / 2.5);
  let restingPose = $derived(floatPose(0));
  let energized = $derived((hovered || anticipating) && !glowing);

  function floatPose(phase: number) {
    return `translateY(${-Math.sin(phase) * settings.floatHeight * unit}px) rotateX(${-0.08 + Math.cos(phase) * .04}rad) rotateY(${Math.sin(phase) * settings.sway}rad) rotateZ(${Math.cos(phase) * settings.sway * .2}rad)`;
  }

  onMount(() => {
    const observer = new IntersectionObserver(([entry]) => visible = entry.isIntersecting);
    observer.observe(host);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!model || reduced || cleared) { playback = undefined; return; }
    const element = model;
    const hit = celebration;
    const count = settings.animationSamples;
    const pose = lastPose ?? getComputedStyle(element).transform;
    const frames = Array.from({ length: count + 1 }, (_, i) => {
      const t = i / count;
      if (hit) {
        const eased = 1 - Math.pow(1 - t, settings.spinEasePower);
        const hop = Math.sin(Math.PI * Math.sqrt(t)) * settings.hopHeight * unit;
        return { offset: t, transform: i === 0 && pose !== 'none' ? pose : `translateY(${-hop}px) rotateY(${settings.spinTurns * 360 * eased}deg) rotateX(${Math.sin(t * Math.PI) * settings.hitTilt}rad)` };
      }
      return { offset: t, transform: floatPose(t * Math.PI * 2) };
    });
    const animation = element.animate(frames, {
      duration: hit ? hit.spinMs : settings.floatPeriodMs,
      iterations: hit ? 1 : Infinity,
      fill: 'both'
    });
    // Establish the pose before the visibility observer's first callback.
    animation.pause();
    animation.currentTime = hit ? Math.max(0, performance.now() - hit.startedAt) : 0;
    playback = { animation, startedAt: hit?.startedAt };
    return () => { lastPose = getComputedStyle(element).transform; animation.cancel(); };
  });

  $effect(() => {
    const current = playback;
    if (!current) return;
    if (!visible) { current.animation.pause(); return; }
    // Hover and approach only affect the glow. Idle motion keeps its phase;
    // celebrations follow elapsed time when a target returns onscreen.
    if (current.startedAt !== undefined) current.animation.currentTime = Math.max(0, performance.now() - current.startedAt);
    current.animation.play();
  });
</script>

{#snippet face(back = false)}
  <svg viewBox="0 0 100 100" class="stone-face" class:back aria-hidden="true">
    <defs>
      <mask id={`${maskId}-${back ? 'back' : 'front'}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" style="mask-type: alpha">
        <image href={assetUrl(appearance.tintMask)} width="100" height="100" />
      </mask>
      <mask id={`${maskId}-hover-${back ? 'back' : 'front'}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" class="[mask-type:alpha]">
        <image href={assetUrl(appearance.hoverMask)} width="100" height="100" />
      </mask>
    </defs>
    <g class="rune-artwork">
      <image href={assetUrl(appearance.image)} width="100" height="100" preserveAspectRatio="xMidYMid meet" />
      <rect class="rune-tint" width="100" height="100" mask={`url(#${maskId}-${back ? 'back' : 'front'})`} />
    </g>
    <g class={['rune-hover-glow pointer-events-none transition-opacity duration-400 ease-in-out', energized ? 'opacity-100' : 'opacity-0']} style:transition-duration={reduced ? '0ms' : undefined}>
      <g class={!reduced ? 'animate-pulse [animation-duration:2400ms]' : undefined} style:animation-play-state={visible && energized ? 'running' : 'paused'}>
        <g style:filter={`blur(${settings.glowSpread * 24}px)`} opacity={Math.min(1, settings.glowIntensity * .3)}>
          <rect width="100" height="100" class="fill-(--game-success)" mask={`url(#${maskId}-hover-${back ? 'back' : 'front'})`} />
        </g>
        <rect width="100" height="100" class="fill-(--game-success)" opacity={Math.min(1, settings.glowIntensity * .4)} mask={`url(#${maskId}-hover-${back ? 'back' : 'front'})`} />
      </g>
    </g>
    <g class="rune-glow" class:lit={glowing}>
      <path d={appearance.check} fill="var(--game-success)" style:filter={`blur(${settings.glowSpread * 32}px)`} opacity={Math.min(1, settings.glowIntensity * .35)} />
      <path d={appearance.check} fill="var(--game-success)" />
      <path d={appearance.check} fill="none" stroke="#e6ffdf" stroke-width=".65" opacity={Math.min(1, settings.glowIntensity * .3)} />
    </g>
  </svg>
{/snippet}

<div class="target-model stone-tablet" class:cleared={glowing} data-target-variant={appearance.id} data-hovered={hovered && !glowing} data-anticipating={anticipating && !glowing} data-energized={energized} bind:this={host} aria-hidden="true"
  style:--tablet-depth={`${settings.depth * unit}px`} style:--stone={settings.artwork === 'blade-runner' ? '#272727' : settings.artwork === 'nuclear-reactor' ? '#34392b' : settings.stoneColor} style:--carving={settings.artwork === 'blade-runner' ? '#070707' : settings.artwork === 'nuclear-reactor' ? '#080a06' : settings.carvingColor} style:--glow-duration={`${reduced ? 0 : settings.glowMs}ms`} style:perspective={`${settings.perspectivePx}px`}>
  <div class="tablet-body" bind:this={model} style:transform={reduced || cleared ? undefined : restingPose}>
    {#each appearance.edges as edge}
      <div class="stone-edge" style:left={`${edge.x}%`} style:top={`${edge.y}%`} style:width={`${edge.length}%`}
        style:transform={`rotateZ(${edge.angle}deg) rotateX(90deg) translateY(calc(var(--tablet-depth) / -2))`}></div>
    {/each}
    {#each appearance.carvingEdges as edge}
      <div class="stone-edge carving-edge" style:left={`${edge.x}%`} style:top={`${edge.y}%`} style:width={`${edge.length}%`}
        style:transform={`rotateZ(${edge.angle}deg) rotateX(90deg) translateY(calc(var(--tablet-depth) / -2))`}><div class="carving-light"></div></div>
    {/each}
    {@render face(true)}
    {@render face()}
  </div>
</div>

<style>
  .stone-tablet { --metal-light: color-mix(in srgb, var(--stone) 28%, #e3e8e6); --metal-mid: color-mix(in srgb, var(--stone) 58%, #b2bcbb); --metal-dark: color-mix(in srgb, var(--stone) 65%, #10161a); display: block; width: 100%; height: 100%; pointer-events: none; padding: 10%; }
  .stone-tablet[data-target-variant='blade-runner'] { --metal-light: #9b9b9b; --metal-mid: #454545; --metal-dark: #0d0d0d; }
  .stone-tablet[data-target-variant='blade-runner'] .rune-tint { opacity: var(--hud-art-tint-strength, .3); }
  .stone-tablet[data-target-variant='nuclear-reactor'] { --metal-light: #a9aa95; --metal-mid: #555743; --metal-dark: #11130e; }
  .rune-artwork { isolation: isolate; }
  .rune-tint { fill: var(--rune-tint, var(--ui-tint)); mix-blend-mode: color; }
  .tablet-body { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
  .stone-face { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; transform: translateZ(calc(var(--tablet-depth) / 2)); backface-visibility: hidden; }
  .stone-face.back { transform: translateZ(calc(var(--tablet-depth) / -2)) rotateY(180deg) scaleX(-1); }
  .stone-edge { position: absolute; height: var(--tablet-depth); transform-origin: 0 0; background: linear-gradient(var(--metal-light), var(--stone) 22%, var(--metal-dark) 60%, var(--metal-mid) 85%, var(--metal-dark)); backface-visibility: visible; }
  .carving-edge { background: linear-gradient(var(--carving), color-mix(in srgb, var(--stone) 65%, var(--carving))); }
  .carving-light { width: 100%; height: 100%; background: var(--game-success); opacity: 0; transition: opacity var(--glow-duration) ease-out; }
  .cleared .carving-light { opacity: 1; }
  .rune-glow { opacity: 0; transition: opacity var(--glow-duration) ease-out; }
  .rune-glow.lit { opacity: 1; }
</style>
