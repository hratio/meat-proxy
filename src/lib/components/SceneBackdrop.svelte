<script lang="ts">
  import { untrack } from 'svelte';
  import type { Splash2Config } from './splash/splash2-playback-config';
  import type { BackgroundConfig } from '$lib/backgrounds/config';
  import { backgroundSceneSettings, introSceneSettings } from '$lib/backgrounds/scene';
  import SplashLandscape from './splash/SplashLandscape.svelte';

  let { intro = false, departing = false, prepared = true, time = 0, reducedMotion = false, introReducedMotion = reducedMotion,
    background, introSettings, onintroend, onstatus }: {
    intro?: boolean; departing?: boolean; prepared?: boolean; time?: number; reducedMotion?: boolean; introReducedMotion?: boolean;
    background?: BackgroundConfig;
    introSettings?: Splash2Config['scene'];
    onintroend?: () => void;
    onstatus?: (status: 'loading' | 'ready' | 'fallback') => void;
  } = $props();
  let mounted = $state(false), ready = $state(false);
  const opening = $derived({ ...introSceneSettings, ...introSettings });
  const selected = $derived(background?.mode === 'scene');
  const active = $derived(intro || selected);
  const reduce = $derived(intro ? introReducedMotion : reducedMotion);
  const duration = $derived(reduce ? 100 : intro ? opening.fadeOutMs : 450);
  const opacity = $derived(intro ? departing ? 0 : 1 : active && ready ? background?.sceneOpacity ?? 0 : 0);

  $effect(() => {
    if (active) { mounted = true; return; }
    // Retire only after the fade; a quick re-selection cancels the disposal.
    const timeout = setTimeout(() => { mounted = false; ready = false; }, duration + 100);
    return () => clearTimeout(timeout);
  });
  $effect(() => {
    if (!intro || !departing) return;
    // Cover zero-duration transitions and fades interrupted by the browser.
    const timeout = setTimeout(finishIntro, duration ? duration + 1000 : 0);
    return () => clearTimeout(timeout);
  });
  function transitioned(event: TransitionEvent) {
    if (event.target !== event.currentTarget || event.propertyName !== 'opacity') return;
    if (intro && departing) finishIntro();
    else if (!active) { mounted = false; ready = false; }
  }
  function finishIntro() {
    if (!selected) { mounted = false; ready = false; }
    onintroend?.();
  }
  function status(value: 'loading' | 'ready' | 'fallback') {
    ready = value !== 'loading';
    untrack(() => onstatus?.(value));
  }
</script>

{#if mounted}
  <div class="scene-backdrop" class:startup-landscape={intro} class:departing={intro && departing} class:background={!intro}
    data-scene-mode={intro ? 'intro' : active ? 'background' : 'leaving'} data-scene-ready={ready}
    style:opacity style:--scene-transition={`${duration}ms`} style:--background-blur={`${background?.sceneBlur ?? 0}px`}
    aria-hidden="true" ontransitionend={transitioned}>
    <div class="scene-picture">
      <SplashLandscape settings={intro ? opening : backgroundSceneSettings}
        paused={intro ? !prepared : !active || background?.sceneOpacity === 0} revealed={!intro || prepared}
        time={intro ? time : undefined} reducedMotion={reduce} preview={!intro}
        onstatus={status} />
    </div>
  </div>
{/if}

<style>
  .scene-backdrop { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; background: #080908; transition: opacity var(--scene-transition) linear; }
  .scene-picture { position: absolute; inset: 0; }
  .background .scene-picture { inset: -40px; filter: blur(var(--background-blur)); }
</style>
