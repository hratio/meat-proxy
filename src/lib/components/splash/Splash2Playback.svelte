<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { Play, SkipForward, Volume2, VolumeX } from '@lucide/svelte';
  import { createSplash2Audio } from './splash2-audio';
  import SplashSubtitles from './SplashSubtitles.svelte';
  import { createSplash2Stream } from './splash2-stream';
  import { defaultSplash2Config, splash2Durations, splash2SkipTime, splash2AudioEnd, type Splash2Config } from './splash2-playback-config';

  let { config = defaultSplash2Config, playing = false, started = $bindable(false), paused = false, loop = false, time = $bindable(0), sceneTime = $bindable(0),
    sound = true, volume = .18, preview = false, handoff = false, gameReady = false, reducedMotion, introduction = false, remember = true, startAtCue = false,
    canSkip = false, ondisable, onprepared, onloaded, onfinished }: {
    config?: Splash2Config; playing?: boolean; started?: boolean; paused?: boolean; loop?: boolean; time?: number; sceneTime?: number;
    sound?: boolean; volume?: number; preview?: boolean; handoff?: boolean; gameReady?: boolean; reducedMotion?: boolean;
    introduction?: boolean; remember?: boolean; startAtCue?: boolean;
    canSkip?: boolean; ondisable?: () => Promise<void>;
    onprepared?: (ready: boolean) => void;
    onloaded?: (duration: number, failed: boolean) => void;
    onfinished?: () => void;
  } = $props();
  let player = $state.raw<ReturnType<typeof createSplash2Audio> | ReturnType<typeof createSplash2Stream>>();
  let ready = $state(false), muted = $state(false);
  let needsGesture = $state(false);
  let seekReady = $state(false), returning = $state(false), savingPreference = $state(false), preferenceSaved = $state(false);
  let skipped = $state(false), skipEndsAt = $state<number>();
  let recordedView = false, finished = false;
  let audioDuration = $state(0);
  // Saving an unrelated preference replaces the parent config object. Compare
  // audio values so that save cannot reload the recording during a skip.
  let preparation = $derived(JSON.stringify({ audio: config.audio, sound }));
  let handoffAt = $state<number>(), gameAt = $state<number>();
  let reduce = $derived(reducedMotion ?? prefersReducedMotion.current);
  let durations = $derived(splash2Durations(config));
  let complete = $derived(reduce ? config.timing.hold : durations.complete);
  let anchors = $derived(preview ? { handoff: complete, game: complete + 300 } : { handoff: handoffAt, game: gameAt });
  let total = $derived(Math.max(skipEndsAt ?? 0, reduce ? complete + 100 : durations.cycle, splash2AudioEnd(introduction && skipEndsAt === undefined ? { ...config.audio, end: 'clip' } : config.audio, audioDuration, anchors)));
  let skipTo = $derived(splash2SkipTime(config));
  let skipAvailable = $derived(ready && started && playing && !paused && !handoff && (preview || canSkip) && seekReady && time < skipTo && !reduce);
  let progress = $derived(Math.min(1, Math.max(0, time / Math.max(1, complete))));

  $effect(() => {
    const current = player;
    const { audio, sound: enabled } = JSON.parse(preparation) as { audio: Splash2Config['audio']; sound: boolean };
    if (!current) return;
    let canceled = false;
    ready = false; untrack(() => onprepared?.(false));
    void current.prepare(audio, enabled).then(result => {
      if (canceled) return;
      audioDuration = result.duration; ready = true; onloaded?.(result.duration, result.failed); onprepared?.(true);
    });
    return () => { canceled = true; };
  });
  $effect(() => {
    if (handoff && handoffAt === undefined) handoffAt = untrack(() => time);
    if (gameReady && gameAt === undefined) gameAt = untrack(() => time);
  });
  $effect(() => { player?.anchors(anchors); });
  $effect(() => { if (player && 'holdEnding' in player) player.holdEnding(introduction && skipEndsAt === undefined); });
  $effect(() => {
    if (!started || !playing || !ready || preview || !remember || recordedView) return;
    recordedView = true;
    try {
      const key = 'meat-proxy:intro-views';
      const previous = Number(localStorage.getItem(key)) || 0;
      returning = previous >= 1;
      localStorage.setItem(key, String(Math.min(2, previous + 1)));
    } catch { /* Playback does not require storage. */ }
  });
  $effect(() => {
    if (!handoff || !skipped || introduction || preview || skipEndsAt !== undefined || !player || !('finish' in player)) return;
    // Keep the musical cut and title reveal, then shorten only the skipped tail.
    skipEndsAt = untrack(() => time) + 300;
    player.finish(300);
  });

  export function finishMusic(fadeMs: number) {
    if (!player || !('finish' in player) || skipEndsAt !== undefined) return;
    skipEndsAt = time + fadeMs;
    player.finish(fadeMs);
  }

  export function skipIntro() {
    if (!skipAvailable || !player) return false;
    skipped = true;
    time = skipTo;
    // Seek immediately, before the next native playhead sample. sceneTime is
    // deliberately untouched: the drive continues at its existing position.
    player.sync(time, true, sound ? volume : 0);
    return true;
  }
  async function dontShowAgain() {
    if (!ondisable || savingPreference) return;
    skipIntro();
    savingPreference = true;
    try { await ondisable(); preferenceSaved = true; }
    catch { /* The parent reports persistence errors; leave the control retryable. */ }
    finally { savingPreference = false; }
  }

  function toggleMute() {
    muted = !muted; player?.setMuted(muted);
    try { if (remember) localStorage.setItem('meat-proxy:opening-audio-muted', String(muted)); } catch { /* Session mute works without storage. */ }
    if (!muted) player?.unlock();
  }
  onMount(() => {
    try { if (remember) muted = (localStorage.getItem('meat-proxy:opening-audio-muted') ?? localStorage.getItem('meat-proxy:audio-muted')) === 'true'; } catch { /* Storage may be disabled. */ }
    const current = preview ? createSplash2Audio() : createSplash2Stream();
    current.setMuted(muted); player = current;
    let request = 0, previous = 0, previousTime = time;
    function tick() {
      // A frame's timestamp can predate a busy earlier RAF callback. Read the
      // clock here so loading the game cannot falsely seek the audio twice.
      const now = performance.now();
      const delta = previous ? Math.max(0, now - previous) : 0; previous = now;
      // Streaming uses the native playhead, including its buffering pauses.
      // Silent playback and editor previews use elapsed time. Browser-denied
      // audio holds both clocks at the beginning until a gesture unlocks it.
      if (ready && playing && !paused && (!('canAdvance' in current) || current.canAdvance())) {
        started = true;
        const before = time;
        const audioTime = 'playhead' in current ? current.playhead() : undefined;
        if (audioTime !== undefined) time = Math.max(time, audioTime);
        else if (preview || !gameReady || time < total) time += delta;
        sceneTime += Math.max(0, time - before);
        if (preview && loop && !reduce && time >= total) { time %= total; sceneTime = time; }
        else if (preview) time = Math.min(time, total);
      }
      if (!preview && time < previousTime) { handoffAt = gameAt = undefined; }
      previousTime = time;
      current.sync(time, ready && playing && !paused && time < total, sound ? volume : 0);
      needsGesture = ready && playing && !paused && 'needsGesture' in current && current.needsGesture();
      seekReady = ready && (!('canSeek' in current) || current.canSeek(skipTo));
      if (startAtCue && !skipped) skipIntro();
      const audioEnd = sound ? splash2AudioEnd(config.audio, audioDuration, anchors) : 0;
      if (!preview && handoff && !finished && (!introduction || skipEndsAt !== undefined) && time >= (introduction ? skipEndsAt ?? audioEnd : Math.min(audioEnd, skipEndsAt ?? Infinity))) {
        finished = true; onfinished?.();
      }
      request = requestAnimationFrame(tick);
    }
    request = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(request); current.dispose(); player = undefined; };
  });
</script>

{#if needsGesture}
  <div class="opening-start">
    <button class="start-intro" onclick={() => player?.unlock()}><Play size={20} fill="currentColor" /><span>Start intro</span></button>
    <p>Click anywhere or press a key</p>
  </div>
{/if}

{#if ready && started && playing}
  <SplashSubtitles {time} settings={config.subtitles} audio={config.audio} fixed={!preview} endTime={skipEndsAt ?? Infinity} />
{/if}

{#if preview || (!handoff && started && !needsGesture)}
  <div class="opening-controls" class:preview>
    {#if !preview}
      <div class="opening-progress" role="progressbar" aria-label="Intro progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div class="progress-track"><i style:transform={`scaleX(${progress})`}></i></div>
      </div>
    {/if}
    <div class="opening-buttons">
    {#if skipAvailable}
      <button class="opening-skip" onclick={skipIntro}><SkipForward size={14} /><span>Skip</span></button>
    {:else if !preview && (!ready || !canSkip || (!reduce && time < skipTo && !seekReady))}
      <span class="opening-loading" role="status">Loading assets…</span>
    {/if}
    {#if sound}<button class="audio-mute" aria-label={muted ? 'Unmute opening audio' : 'Mute opening audio'} aria-pressed={muted} onclick={toggleMute}>
      {#if muted}<VolumeX size={16} />{:else}<Volume2 size={16} />{/if}<span>{muted ? 'Unmute' : 'Mute'}</span>
    </button>{/if}
    </div>
  </div>
  {#if !preview && returning && ondisable && playing && !preferenceSaved}
    <div class="splash-preference"><button disabled={savingPreference || !canSkip || (!reduce && time < skipTo && !skipAvailable)} onclick={dontShowAgain}>{savingPreference ? 'Saving…' : "Don't show again"}</button></div>
  {/if}
{/if}

<style>
  .opening-start { position: fixed; inset: 0; z-index: 250; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: #11110f; color: #d5d2c4; font: 12px system-ui, sans-serif; }
  .start-intro { display: flex; align-items: center; gap: 12px; padding: 16px 24px; border: 1px solid #b5a77c; border-radius: 4px; background: #252820; color: inherit; font: 600 16px system-ui, sans-serif; cursor: pointer; }
  .start-intro:hover { background: #34382b; }
  .opening-start p { margin: 0; color: #b8bbaa; }
  .opening-controls { position: fixed; right: 22px; bottom: 22px; z-index: 250; display: flex; flex-direction: column; align-items: stretch; gap: 10px; min-width: 150px; color: #d5d2c4; font: 11px system-ui, sans-serif; }
  .opening-controls.preview { position: absolute; right: 12px; bottom: 12px; }
  .opening-buttons { display: flex; justify-content: flex-end; gap: 10px; }
  .opening-loading { align-self: center; padding: 8px 0; color: #b8bbaa; }
  .opening-controls button { display: flex; align-items: center; gap: 7px; border: 1px solid #d5d2c430; border-radius: 4px; padding: 8px 10px; background: #101310d9; color: inherit; font: inherit; cursor: pointer; }
  .opening-controls button:hover { background: #252b24; }
  button:focus-visible { outline: 2px solid #d5d2c4; outline-offset: 3px; }
  .progress-track { height: 2px; overflow: hidden; background: #d5d2c425; }
  .progress-track i { display: block; height: 100%; background: #b5a77c; transform-origin: left; }
  .splash-preference { position: fixed; bottom: 22px; left: 22px; z-index: 250; font: 11px system-ui, sans-serif; }
  .splash-preference button { border: 0; padding: 8px 0; background: transparent; color: #bbb; font: inherit; cursor: pointer; }
  .splash-preference button:disabled { opacity: .45; cursor: default; }
  @media (max-width: 540px) { .splash-preference { bottom: 75px; } }
</style>
