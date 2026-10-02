<script lang="ts">
  import type { IntroductionPhase } from '$lib/introduction/director';
  import { resolveSplash2Config } from '$lib/components/splash/splash2-playback-config';
  import { onMount } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import type SplashScreen from '$lib/components/splash/Splash2Screen.svelte';
  import SceneBackdrop from '$lib/components/SceneBackdrop.svelte';
  import type { BackgroundConfig } from '$lib/backgrounds/config';
  import Splash2Playback from '$lib/components/splash/Splash2Playback.svelte';
  import { leaveSplash } from '$lib/components/splash/transition';
  import { defaultOpeningConfig as defaultSplash2Config } from '$lib/components/splash/opening-config';
  import { readStartupPreferences } from '../startup-preferences';
  import type DemoReview from '../DemoReview.svelte';

  let opening = $state(defaultSplash2Config);
  let preview = $state(false), introduction = $state(false);
  let introductionPhase = $state<IntroductionPhase>('preparing');
  let playback = $state<Splash2Playback>();
  let Review = $state<typeof DemoReview>();
  let Artwork = $state<typeof SplashScreen>();
  let preferences = $state<Awaited<ReturnType<typeof readStartupPreferences>>>();
  let imagesReady = $state(false), sceneReady = $state(false);
  let audioReady = $state(false), audioFinished = $state(false), openingTime = $state(0), sceneTime = $state(0), gamePlayable = $state(false);
  let playing = $state(false), started = $state(false), assembled = $state(false), completed = $state(false);
  let reviewReady = $state(false), visible = $state(true), leaving = $state(false);
  let sceneVisible = $state(true), error = $state('');
  let disableIntro = $state<() => Promise<void>>();
  let background = $state<BackgroundConfig>();
  let downloading = false;
  let downloadingArtwork = false;
  let reduced = $derived(!!preferences?.reducedMotion || prefersReducedMotion.current);
  let artworkAtStart = $derived(reduced || !opening.scene.enabled);
  // If an unusually slow download reaches the reveal, hold its audio/visual
  // clock together. Skip also waits for artwork, so it cannot land on blanks.
  let waitingForArtwork = $derived(!imagesReady && openingTime >= opening.openingDelay);
  // The saved preference belongs to the next visit, not this intro's lifetime.
  let showSplash = $state(false);

  onMount(() => {
    preview = new URLSearchParams(location.search).has('intro-preview');
    if (preview) {
      try { opening = resolveSplash2Config(JSON.parse(decodeURIComponent(location.hash.slice(1)))); }
      catch { /* A preview without edits uses the saved composition. */ }
    }
    void readStartupPreferences().then(value => {
      preferences = value;
      showSplash = preferences.showSplashScreen;
      introduction = showSplash && opening.introduction.enabled
        && !preferences.reducedMotion && !prefersReducedMotion.current;
    });
  });

  async function loadReview() {
    // Exclude this import from prerendering too: SvelteKit otherwise includes
    // a dynamic component's CSS in the initial HTML to prevent unstyled SSR.
    if (import.meta.env.SSR || downloading || Review) return;
    downloading = true;
    try {
      // This is the Pages bundle boundary: UI/CSS/fonts, diff libraries and the
      // repository worker cannot start downloading before this call.
      Review = (await import('../DemoReview.svelte')).default;
    } catch (cause) { error = `Unable to load the review: ${String(cause)}`; }
    finally { downloading = false; }
  }

  async function loadArtwork() {
    if (import.meta.env.SSR || downloadingArtwork || Artwork) return;
    downloadingArtwork = true;
    try { Artwork = (await import('$lib/components/splash/Splash2Screen.svelte')).default; }
    catch (cause) { error = `Unable to load the title artwork: ${String(cause)}`; }
    finally { downloadingArtwork = false; }
  }

  $effect(() => {
    if (preferences && showSplash && artworkAtStart) void loadArtwork();
  });

  $effect(() => {
    if (!preferences || playing) return;
    if (!showSplash) { void loadReview(); return; }
    if ((artworkAtStart && !imagesReady) || !audioReady || (opening.scene.enabled && !sceneReady) || error) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => playing = true);
    });
    return () => cancelAnimationFrame(frame);
  });

  // Give the prepared scene a paint before downloading the arena and title.
  // These downloads also run while playback waits for a browser gesture.
  $effect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { void loadArtwork(); void loadReview(); });
    });
    return () => cancelAnimationFrame(frame);
  });

  function landed() { assembled = true; }
  function audioPreferences(sound: boolean, volume: number) {
    if (preferences && (preferences.sound !== sound || preferences.volume !== volume)) preferences = { ...preferences, sound, volume };
  }
  function backgroundPreferences(value: BackgroundConfig, reducedMotion: boolean) {
    background = value;
    if (preferences && preferences.reducedMotion !== reducedMotion) preferences = { ...preferences, reducedMotion };
  }

  $effect(() => {
    if (!visible || !reviewReady || (showSplash && !completed)) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { leaving = true; visible = false; });
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<svelte:head>
  <title>meat-proxy</title>
  <meta name="description" content="Your code review. Your arsenal. A playable browser demo." />
</svelte:head>

{#if showSplash && (!audioFinished || visible || leaving || (sceneVisible && opening.scene.enabled))}
  <Splash2Playback bind:this={playback} config={opening} {introduction} remember={false} startAtCue={preview} playing={playing && !error} bind:started paused={waitingForArtwork} bind:time={openingTime} bind:sceneTime sound={preferences?.sound} volume={preferences?.volume}
    reducedMotion={reduced} handoff={!visible} gameReady={gamePlayable} canSkip={reviewReady && imagesReady} ondisable={disableIntro}
    onprepared={ready => audioReady = ready} onfinished={() => audioFinished = true} />
{/if}

<SceneBackdrop intro={showSplash && sceneVisible && opening.scene.enabled} departing={!visible}
  introSettings={opening.scene} prepared={started} time={sceneTime} reducedMotion={reduced} {background}
  onintroend={() => sceneVisible = false} onstatus={status => sceneReady = status !== 'loading'} />

<div class="introduction-status" data-introduction={introduction ? introductionPhase : 'disabled'} hidden></div>

{#if Review}
  <Review startup={{ covered: visible, introduction: introduction ? opening.introduction : undefined, preview,
    onintroduction: phase => { if (phase === 'done' && introductionPhase === 'preparing') introduction = false; introductionPhase = phase; }, onmusicend: () => playback?.finishMusic(opening.introduction.musicFadeMs), onready: ready => reviewReady = ready,
    onerror: message => error = message, onintropreference: disable => disableIntro = disable, onplayable: ready => gamePlayable = ready, onaudiochange: audioPreferences,
    onbackgroundchange: backgroundPreferences }} />
{/if}

{#if visible}
  <main class="startup-screen" data-phase={!started ? 'loading' : assembled ? 'hold' : 'intro'}
    aria-label="Starting Meat Proxy" aria-busy="true" out:leaveSplash|global={{ reducedMotion: reduced, introduction: opening.introduction }}
    onoutroend={() => leaving = false}>
    {#if showSplash && Artwork}
      <Artwork config={opening} landscape={false} paused={!started || waitingForArtwork} showArtwork={started} time={openingTime} externalClock reducedMotion={reduced}
        onready={() => imagesReady = true} onassembled={landed} oncomplete={() => completed = true}
        onerror={cause => error = cause.message} />
    {/if}
    {#if !started || error}
      <div class="startup-loader" role="status">
        <span></span><p>{error || 'Loading…'}</p>
        {#if error}<button onclick={() => location.reload()}>Try again</button>{/if}
      </div>
    {:else if completed && !reviewReady}
      <p class="review-loading" role="status">Loading review…</p>
    {/if}
  </main>
{/if}

<style>
  .startup-screen { position: fixed; inset: 0; z-index: 200; width: 100%; height: 100dvh; overflow: hidden; color: #d5d2c4; font: 12px system-ui, sans-serif; }
  .startup-loader { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 16px; background: #11110f; text-align: center; }
  .startup-loader span { width: 48px; height: 1px; background: #b5a77c; }
  .startup-loader p { margin: 0; max-width: 40em; padding: 0 24px; letter-spacing: .15em; }
  .startup-loader button { border: 1px solid #b5a77c; padding: 8px 16px; color: inherit; background: #191916; cursor: pointer; }
  .review-loading { position: absolute; bottom: 24px; left: 24px; margin: 0; }
</style>
