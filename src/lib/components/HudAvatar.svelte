<script lang="ts">
  import { untrack } from 'svelte';
  import type { MockDaddyEffectsOptions } from '$lib/avatar/effects';
  import type { AvatarPlayback, AvatarRequest } from '$lib/avatar/playback';
  import { createPortraitTransitionView, transitionDefaults, type AvatarTransitionFrame, type AvatarTransitions } from '$lib/avatar/transitions';
  import { avatarDefaults, type AvatarEffectsPreset, type AvatarFraming, type AvatarMotion, type AvatarQuality, type AvatarTilt } from '$lib/avatar/presentation';
  import { createRenderHost } from '$lib/render/host';
  import type { PortraitState, PortraitEvent } from '$lib/avatar/renderer';
  import { createPortraitCurtain, type CurtainPhase } from '$lib/avatar/curtain';
  import type { PortraitSignalPhase } from '$lib/avatar/signal';
  let {
    request, transitions = avatarDefaults.transitions, effects = 'normal', effectOverrides = {}, effectsEnabled = true,
    tilt = avatarDefaults.tilt, motion = avatarDefaults.motion, framing = avatarDefaults.framing,
    quality = avatarDefaults.quality, reducedMotion = false, paused = false,
    puff = 0, flash = 0, reset = 0, onplayback, oncomplete, bare = false,
    startup = 'ready', onstartupcomplete, onprepared, cover, oncovered, coverTransitions, coverPaused = false,
    signal = 'live', signalDurationMs = 380
  }: {
    request?: AvatarRequest;
    transitions?: AvatarTransitions;
    effects?: AvatarEffectsPreset;
    effectOverrides?: Partial<MockDaddyEffectsOptions>;
    effectsEnabled?: boolean;
    tilt?: AvatarTilt;
    motion?: AvatarMotion;
    framing?: AvatarFraming;
    quality?: AvatarQuality;
    reducedMotion?: boolean;
    paused?: boolean;
    puff?: number;
    flash?: number;
    reset?: number;
    onplayback?: (state: AvatarPlayback) => void;
    oncomplete?: (id: number) => void;
    bare?: boolean;
    startup?: 'closed' | 'opening' | 'ready';
    onstartupcomplete?: () => void;
    onprepared?: (ready: boolean) => void;
    /** Transmission ID holding the presentation shutter closed, independently of expression playback. */
    cover?: number;
    oncovered?: (id: number) => void;
    coverTransitions?: Partial<AvatarTransitions>;
    coverPaused?: boolean;
    signal?: PortraitSignalPhase;
    signalDurationMs?: number;
  } = $props();

  let canvas = $state<HTMLCanvasElement>();
  let transitionCanvas = $state<HTMLCanvasElement>();
  let generation = $state(0), forceMain = false;
  let loaded = $state(false), error = $state('');
  let activeExpression = $state('Idle'), transitionPhase = $state('steady');
  let host = $state.raw<ReturnType<typeof createRenderHost<PortraitState, PortraitEvent>>>();
  let resizePresentation: (() => void) | undefined;
  let refreshCurtain: (() => void) | undefined;
  const curtain = createPortraitCurtain();
  let curtainPhase = $state<CurtainPhase>('open'), curtainIntro = $state('');
  let acknowledgedCover: number | undefined;
  let transitionFrame: AvatarTransitionFrame = { ...transitionDefaults, phase: 'steady', progress: 0 };
  const presentation = $derived({ transitions, effects, effectOverrides, effectsEnabled, tilt, motion, framing, quality, reducedMotion, paused, bare, startup, signal, signalDurationMs, reportPlayback: !!onplayback });

  $effect(() => { host?.update($state.snapshot(presentation)); });
  // Commands use separate patches, so routine layout/settings updates never replay a cue.
  $effect(() => { host?.update({ request: $state.snapshot(request) }); });
  $effect(() => { host?.update({ puff, flash, reset }); });
  $effect(() => { quality.renderScale; untrack(() => resizePresentation?.()); });
  $effect(() => {
    const id = cover, reduced = reducedMotion;
    if (id === undefined) acknowledgedCover = undefined;
    const settings = $state.snapshot({ ...transitions, ...request?.transition, ...coverTransitions });
    untrack(() => { curtain.setCover(id, settings, reduced); refreshCurtain?.(); });
  });
  $effect(() => { coverPaused; untrack(() => refreshCurtain?.()); });
  $effect(() => {
    const phase = startup;
    if (phase === 'opening' && (reducedMotion || error)) untrack(() => onstartupcomplete?.());
    untrack(() => refreshCurtain?.());
  });

  $effect(() => {
    if (!canvas || !transitionCanvas) return;
    const portrait = canvas, overlay = transitionCanvas;
    return untrack(() => {
      loaded = false; error = ''; onprepared?.(false);
      const view = createPortraitTransitionView(overlay, portrait);
      const size = () => ({ width: Math.max(1, portrait.clientWidth), height: Math.max(1, portrait.clientHeight), pixelRatio: devicePixelRatio });
      const drawTransition = () => {
        const override = curtain.frame;
        view.render(startup === 'closed' ? { ...transitionDefaults, phase: 'intro', intro: 'shutter-open', progress: 0 } : override ?? transitionFrame);
        curtainPhase = curtain.phase; curtainIntro = override?.intro || '';
        const covered = curtain.closedFor;
        if (covered !== undefined && covered !== acknowledgedCover) {
          acknowledgedCover = covered; oncovered?.(covered);
        }
      };
      let curtainFrame = 0, lastCurtainFrame = 0;
      const animateCurtain = (now: number) => {
        curtainFrame = 0;
        curtain.update(document.hidden || coverPaused ? 0 : Math.min(50, now - lastCurtainFrame)); lastCurtainFrame = now;
        drawTransition();
        if (curtain.moving && !coverPaused) curtainFrame = requestAnimationFrame(animateCurtain);
      };
      const refresh = () => {
        cancelAnimationFrame(curtainFrame); curtainFrame = 0;
        drawTransition();
        if (curtain.moving && !coverPaused) { lastCurtainFrame = performance.now(); curtainFrame = requestAnimationFrame(animateCurtain); }
      };
      const resize = () => {
        const bounds = size();
        view.resize(bounds.width, bounds.height, Math.max(bounds.pixelRatio, quality.renderScale));
        drawTransition(); current.resize(bounds);
      };
      const failure = (reason: unknown) => {
        error = 'Portrait unavailable'; console.warn('HUD portrait:', reason);
        onprepared?.(true);
        if (request?.id !== undefined) oncomplete?.(request.id);
      };
      const current = createRenderHost<PortraitState, PortraitEvent>({
        kind: 'portrait', canvas: portrait, forceMain, size: size(),
        state: { ...$state.snapshot(presentation), request: $state.snapshot(request), puff, flash, reset, visible: true, hidden: document.hidden },
        fallback: () => { forceMain = true; generation++; }, failure,
        event(event) {
          if (event.type === 'loaded') { loaded = true; onprepared?.(true); }
          else if (event.type === 'error') failure(event.message);
          else if (event.type === 'playback') { activeExpression = event.state.expression; transitionPhase = event.state.phase; onplayback?.(event.state); }
          else if (event.type === 'complete') oncomplete?.(event.id);
          else if (event.type === 'startup-complete') onstartupcomplete?.();
          else if (event.type === 'transition') { transitionFrame = event.frame; drawTransition(); }
        }
      });
      host = current; resizePresentation = resize; refreshCurtain = refresh; resize(); refresh();
      const observer = new ResizeObserver(resize); observer.observe(portrait);
      const intersection = new IntersectionObserver(([entry]) => current.update({ visible: entry.isIntersecting }));
      intersection.observe(portrait.parentElement!);
      const visibility = () => current.update({ hidden: document.hidden });
      document.addEventListener('visibilitychange', visibility);
      window.addEventListener('resize', resize);
      return () => {
        cancelAnimationFrame(curtainFrame);
        current.dispose(); observer.disconnect(); intersection.disconnect(); view.dispose();
        document.removeEventListener('visibilitychange', visibility); window.removeEventListener('resize', resize);
        if (host === current) host = undefined;
        if (resizePresentation === resize) resizePresentation = undefined;
        if (refreshCurtain === refresh) refreshCurtain = undefined;
      };
    });
  });
</script>

<div class="hud-avatar" class:bare role="img" aria-label={`Reviewer portrait: ${activeExpression}`} data-expression={activeExpression} data-transition={transitionPhase} data-loaded={loaded} data-startup={startup} data-curtain={curtainPhase} data-curtain-intro={curtainIntro} data-signal={signal}>
  {#key generation}<canvas class="portrait-canvas" bind:this={canvas} style:opacity={loaded ? 1 : 0}></canvas>{/key}
  {#if !bare && loaded && signal !== 'off'}
    <div class="signal-glass" aria-hidden="true"><span class="signal-channel">CH / 01</span><span class="signal-remote"><i></i>REMOTE</span></div>
  {/if}
  <canvas class="transition-canvas" bind:this={transitionCanvas} aria-hidden="true"></canvas>
  {#if error}<span class="avatar-error">{error}</span>{/if}
</div>

<style>
  .hud-avatar { position: relative; width: 100%; height: 100%; pointer-events: none; overflow: hidden; isolation: isolate; }
  .bare { overflow: visible; }
  canvas { display: block; width: 100%; height: 100%; }
  .portrait-canvas { position: relative; z-index: 1; transform-origin: 50% 50%; will-change: transform; }
  .signal-glass { position: absolute; z-index: 1; inset: 0; box-shadow: inset 0 0 14px 4px #0009, inset 0 0 0 1px #b5b9c517; background: linear-gradient(125deg, #c0c4d209, transparent 38%, #0000000d 70%); color: #a5a7af88; font: 6px/1 var(--mono, monospace); letter-spacing: .12em; }
  .signal-channel { position: absolute; top: 8px; left: 8px; }
  .signal-remote { position: absolute; bottom: 8px; left: 8px; display: flex; align-items: center; gap: 4px; }
  .signal-remote i { width: 3px; height: 3px; background: #c0c2cd; opacity: .65; box-shadow: 0 0 4px #d0d5e555; }
  .transition-canvas { position: absolute; inset: 0; z-index: 2; visibility: hidden; pointer-events: none; }
  .avatar-error { position: absolute; inset: 40% 0 auto; text-align: center; color: var(--muted); font-size: var(--ui-label-size); }
</style>
