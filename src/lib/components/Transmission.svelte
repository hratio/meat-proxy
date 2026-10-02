<script lang="ts">
  import { onMount, untrack, type Snippet } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import type { Config } from '$lib/config';
  import type { ActiveTransmission } from '$lib/game-events/types';
  import { transmissionPlacement } from '$lib/game-events/placement';
  import { shatterTransmission } from '$lib/game-events/debris';
  import { mergeAvatarPresentation, type AvatarPresentation } from '$lib/avatar/presentation';
  import type { AvatarRequest } from '$lib/avatar/playback';
  import HudAvatar from './HudAvatar.svelte';
  import HudFrame from './hud/HudFrame.svelte';
  import PortraitFrame from './hud/PortraitFrame.svelte';

  let { active, config, presentation, diff, navigating = false, clearance = 0, paused = false, prewarm = true, portrait, example = false, onprepared, onoutrocomplete }: {
    active?: ActiveTransmission; config: Config; presentation: AvatarPresentation; diff?: HTMLElement;
    navigating?: boolean; clearance?: number; paused?: boolean; prewarm?: boolean; portrait?: Snippet; example?: boolean; onprepared?: (ready: boolean) => void;
    onoutrocomplete?: (id: number) => void;
  } = $props();
  let surface: HTMLDivElement;
  let debris: HTMLCanvasElement;
  let location = $state({ left: 0, top: 0, width: 0, maxHeight: 0, compact: true, fits: false });
  let viewport = $state({ top: 0, height: 0 });
  let request = $state<AvatarRequest>();
  let currentId = 0;
  let outroCover = $state<number>();
  let outroClosed = $state(false);
  let portraitMounted = $state(false);
  $effect(() => {
    if ((!config.transmissions.enabled && !active) || portraitMounted) return;
    if (active) { portraitMounted = true; return; }
    if (!prewarm) return;
    let idle = 0;
    // Keep the first interactive HUD frames clear, then warm a paused portrait.
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(() => { portraitMounted = true; }, { timeout: 1500 });
      else portraitMounted = true;
    }, 200);
    return () => { clearTimeout(timer); if (idle) cancelIdleCallback(idle); };
  });
  const reduced = $derived(config.display.reducedMotion || prefersReducedMotion.current);
  const face = $derived(mergeAvatarPresentation($state.snapshot(presentation), active?.cue.portrait.presentation));
  const floating = $derived(!reduced && config.transmissions.movement && active?.cue.movement !== false);
  const phase = $derived(active?.phase || 'idle');
  const presented = $derived(!!active && phase !== 'covering' && location.fits);
  const short = $derived(location.maxHeight < 290);
  const stacked = $derived(location.width < 280 && !short);
  const portraitWidth = $derived(short ? 100 : location.compact ? 128 : 176);
  const introMs = $derived(example ? config.transmissions.introSeconds * 1000 : active?.introMs ?? 0);
  // Keep the shutter opening and message extension inside the cue's entrance time.
  const portraitIntroMs = $derived(introMs * .55);
  const messageIntroMs = $derived(introMs - portraitIntroMs);
  const outroMs = $derived(active?.outroMs ?? 0);
  const messageOutroMs = $derived(outroMs * .4);
  const portraitOutroMs = $derived(outroMs * .5);
  const fadeOutroMs = $derived(outroMs - messageOutroMs - portraitOutroMs);
  const portraitCover = $derived(phase === 'covering' ? active?.id : outroCover);

  $effect(() => {
    if (phase !== 'outro') { outroCover = undefined; outroClosed = false; }
    else if (reduced || !outroMs) untrack(() => onoutrocomplete?.(active!.id));
  });
  function messageRetracted(event: AnimationEvent) {
    if (phase === 'outro' && event.target === event.currentTarget) outroCover = active?.id;
  }
  function portraitClosed(id: number) {
    if (phase === 'outro' && id === active?.id) outroClosed = true;
  }
  function exitComplete(event: AnimationEvent) {
    if (phase === 'outro' && outroClosed && event.target === event.currentTarget) onoutrocomplete?.(active!.id);
  }

  // A portal keeps the shooting surface independent of arena clipping/scrolling.
  function portal(node: HTMLElement) { document.body.appendChild(node); return { destroy: () => node.remove() }; }
  $effect(() => {
    const id = active?.id;
    if (!id) { currentId = 0; request = undefined; return; }
    if (id !== currentId) {
      currentId = id;
      request = untrack(() => ({ ...active!.cue.portrait.request, id, policy: 'interrupt', durationMs: 600000, finishCycle: false,
        // The presentation shutter runs independently of worker expression playback.
        transition: { ...face.transitions, introMs: 0, outroMs: 0 } }));
    }
  });
  $effect(() => {
    if (!surface || !diff) return;
    const settings = config.transmissions, left = config.display.sidebarLeft, inset = Math.max(8, config.display.chromeInsetPx);
    const gap = Math.max(12, config.display.chromeGapPx), bottom = Math.max(navigating ? settings.navigatorBottomPx : settings.bottomPx, clearance + 12);
    config.display.wideMode; config.display.codeWidthPx; config.display.sidePanelWidthPx;
    active?.id;
    let raf = 0;
    const measure = () => {
      const v = window.visualViewport;
      const visible = { left: v?.offsetLeft || 0, top: v?.offsetTop || 0, right: (v?.offsetLeft || 0) + (v?.width || innerWidth), bottom: (v?.offsetTop || 0) + (v?.height || innerHeight) };
      viewport = { top: visible.top, height: visible.bottom - visible.top };
      location = transmissionPlacement({ viewport: visible, diff: diff!.getBoundingClientRect(), left, inset, gap,
        preferredWidth: settings.widthPx, height: surface.offsetHeight, bottom });
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(diff); observer.observe(surface);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    schedule();
    return () => { cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); };
  });
  $effect(() => {
    if (phase !== 'shattering' || reduced || !surface || !debris || !active?.shot || !location.fits) return;
    return untrack(() => shatterTransmission(debris, surface, active!.shot!, () => paused));
  });
  onMount(() => () => { currentId = 0; });
</script>

<div use:portal class="transmission-layer pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-live={example ? 'off' : 'polite'} aria-atomic="true"
  data-transmission-phase={phase} data-transmission-visible={presented} data-transmission-example={example} data-reduced-motion={reduced} data-paused={paused} data-side={config.display.sidebarLeft ? 'left' : 'right'}>
  <div class="absolute overflow-clip" style:left={`${location.left}px`} style:top={`${location.top}px`} style:width={`${location.width}px`} style:max-height={`${location.maxHeight}px`}
    class:invisible={!presented} aria-hidden={!presented}>
    <div class="transmission-entry" data-phase={phase} data-reduced={reduced} data-example={example} data-outro-closed={outroClosed}
      style:--portrait-intro={`${portraitIntroMs}ms`} style:--message-intro={`${messageIntroMs}ms`} style:--message-outro={`${messageOutroMs}ms`} style:--fade-outro={`${fadeOutroMs}ms`}
      onanimationend={exitComplete}
      style:animation-play-state={paused ? 'paused' : 'running'}>
      <div bind:this={surface} class="transmission-surface" data-compact={location.compact} data-stacked={stacked} data-short={short} style:--portrait-width={`${portraitWidth}px`}
        class:transmission-float={floating} style:animation-play-state={paused ? 'paused' : 'running'}
        data-shoot-transmission={presented && phase !== 'shattering' && !example ? active?.id : undefined} data-cursor={example ? undefined : 'combat'}
        class:pointer-events-auto={presented && phase !== 'shattering' && !paused && !example} style:cursor="var(--combat-cursor, crosshair)">
        <div class="transmission-portrait" data-transmission-portrait>
          <PortraitFrame brackets={false} mirrored>
            {#if portrait}{@render portrait()}{:else if portraitMounted}
              <HudAvatar {request} {onprepared} transitions={face.transitions} effects={face.effects} effectOverrides={face.effectOverrides}
                cover={portraitCover} oncovered={portraitClosed} coverPaused={paused}
                coverTransitions={{ intro: 'shutter-open', introMs: portraitIntroMs, outroMs: phase === 'covering' ? 0 : portraitOutroMs }}
                signal={phase === 'intro' ? 'connecting' : phase === 'outro' ? 'disconnecting' : 'live'}
                signalDurationMs={phase === 'outro' ? active?.outroMs : active?.introMs}
                effectsEnabled={face.effectsEnabled && presentation.effectsEnabled && !reduced} tilt={face.tilt} motion={face.motion} framing={face.framing} quality={face.quality}
                reducedMotion={reduced} paused={paused || !presented || phase === 'shattering'} />
            {/if}
          </PortraitFrame>
        </div>
        <div class="message-reveal">
          <div data-message-plate class="transmission-message" onanimationend={messageRetracted} style:animation-play-state={paused ? 'paused' : 'running'}>
            <HudFrame variant="panel" openEdge={stacked ? 'top' : 'left'}>
              <div class="message-well" aria-hidden="true"><div class="transmission-signal" data-splash={active?.cue.splash || 'signal'}></div></div>
              <div class="message-content">
                <div class="message-heading">
                  <span class="message-bars" aria-hidden="true"><i></i><i></i><i></i></span>
                  <span data-fragment-text>{active?.cue.title || 'INCOMING TRANSMISSION'}</span>
                </div>
                <p data-fragment-text data-transmission-quote class="message-quote">{active?.cue.text}</p>
                {#if !short}<div class="message-status" aria-hidden="true"><span>MOCKDADDY // COMMS</span><span class="link-status"><i></i>LIVE</span></div>{/if}
              </div>
            </HudFrame>
          </div>
        </div>
      </div>
    </div>
  </div>
  <canvas bind:this={debris} class="pointer-events-none absolute" aria-hidden="true" style:left={`${location.left}px`} style:top={`${viewport.top}px`} style:width={`${location.width}px`} style:height={`${viewport.height}px`}></canvas>
</div>

<style>
  .transmission-surface { position: relative; display: grid; grid-template-columns: var(--portrait-width) minmax(0, 1fr); align-items: stretch; gap: 0; padding: 5px; filter: drop-shadow(0 6px 10px #0008); }
  .transmission-portrait, .message-reveal, .transmission-message { position: relative; min-width: 0; }
  .transmission-portrait { z-index: 1; }
  .transmission-surface[data-stacked='false'] .transmission-portrait { translate: 10px 0; }
  .message-reveal { z-index: 0; margin: 5px 0 5px -2px; overflow: clip; }
  .transmission-message { height: 100%; }
  .message-well { position: absolute; inset: 27px 29px 26px 0; overflow: hidden; border-radius: 0 8px 8px 0; pointer-events: none; }
  .message-content { position: relative; display: flex; flex-direction: column; min-height: 190px; padding: 30px 27px 31px 26px; }
  .message-heading { display: flex; align-items: center; gap: 7px; margin-bottom: 11px; padding-bottom: 9px; border-bottom: 1px solid color-mix(in srgb, var(--hud-accent) 22%, transparent); color: var(--hud-accent); font: 800 11.5px/1.3 var(--display); letter-spacing: .07em; }
  .message-heading > [data-fragment-text] { min-width: 0; overflow-wrap: anywhere; }
  .message-bars { display: flex; flex-shrink: 0; gap: 2px; }
  .message-bars i { width: 3px; height: 9px; transform: skewX(-12deg); background: var(--hud-accent); }
  .message-bars i:nth-child(2) { opacity: .65; } .message-bars i:nth-child(3) { opacity: .35; }
  .message-quote { margin: 0; color: #e5e8d5; font: 500 13px/1.45 var(--font-sans, sans-serif); overflow-wrap: anywhere; }
  .message-status { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 16px; color: color-mix(in srgb, var(--hud-accent) 65%, transparent); font: 6.5px/10px var(--mono); letter-spacing: .12em; white-space: nowrap; }
  .link-status { display: flex; align-items: center; gap: 4px; }
  .link-status i { width: 3px; height: 3px; border-radius: 50%; background: var(--hud-accent); box-shadow: 0 0 4px color-mix(in srgb, var(--hud-accent) 35%, transparent); }
  .transmission-surface[data-compact='true'] .message-content { padding-left: 24px; padding-right: 23px; }
  .transmission-surface[data-compact='true'] .message-quote { font-size: 12px; }
  .transmission-surface[data-compact='true'] .message-heading { font-size: 10px; }
  .transmission-surface[data-compact='true'] .message-status { font-size: 6px; letter-spacing: .08em; }
  .transmission-surface[data-stacked='true'] { grid-template-columns: minmax(0, 1fr); }
  .transmission-surface[data-stacked='true'] .transmission-portrait { height: 164px; }
  .transmission-surface[data-stacked='true'] .message-reveal { margin: -2px 0 0; }
  .transmission-surface[data-stacked='true'] .message-well { inset: 0 29px 26px 20px; border-radius: 0 0 8px 8px; }
  .transmission-surface[data-stacked='true'] .message-content { min-height: 0; padding-left: 25px; }
  .transmission-surface[data-short='true'] .message-content { min-height: 130px; padding-top: 30px; padding-bottom: 29px; }
  .transmission-surface[data-short='true'] .message-quote { font-size: 11px; }
  .transmission-entry[data-reduced='false']:is([data-phase='intro'], [data-example='true'][data-phase='speaking']) { animation: transmission-enter var(--portrait-intro) ease-out both; }
  .transmission-entry[data-reduced='false']:is([data-phase='intro'], [data-example='true'][data-phase='speaking']) .transmission-message { animation: message-enter var(--message-intro) cubic-bezier(.16, 1, .3, 1) var(--portrait-intro) both; }
  .transmission-entry[data-reduced='false']:is([data-phase='intro'], [data-example='true'][data-phase='speaking']) .transmission-surface[data-stacked='true'] .transmission-message { animation-name: message-enter-stacked; }
  .transmission-entry[data-phase='outro'][data-reduced='false'] .transmission-message { animation: message-exit var(--message-outro) cubic-bezier(.7, 0, .84, 0) both; }
  .transmission-entry[data-phase='outro'][data-reduced='false'] .transmission-surface[data-stacked='true'] .transmission-message { animation-name: message-exit-stacked; }
  .transmission-entry[data-phase='outro'][data-outro-closed='true'][data-reduced='false'] { animation: transmission-exit var(--fade-outro) ease-in both; }
  .transmission-entry[data-phase='shattering'] { opacity: 0; }
  .transmission-float { animation: transmission-float 4.8s ease-in-out infinite; }
  .transmission-signal { position: absolute; inset: 0; border-radius: inherit; background: repeating-linear-gradient(0deg, transparent 0 3px, color-mix(in srgb, var(--hud-accent) 5%, transparent) 3px 4px); mask-image: radial-gradient(ellipse, #000 15%, #0005 80%); }
  .transmission-signal[data-splash='impact'] { background: repeating-conic-gradient(from 10deg, transparent 0deg 20deg, var(--hud-accent) 22deg 24deg, transparent 25deg 45deg); opacity: .08; }
  @keyframes transmission-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes message-enter { from { transform: translateX(-100%); } to { transform: translateX(0); } }
  @keyframes message-enter-stacked { from { transform: translateY(-100%); } to { transform: translateY(0); } }
  @keyframes message-exit { from { transform: translateX(0); } to { transform: translateX(-100%); } }
  @keyframes message-exit-stacked { from { transform: translateY(0); } to { transform: translateY(-100%); } }
  @keyframes transmission-exit { from { opacity: 1; } to { opacity: 0; } }
  @keyframes transmission-float { 0%, 100% { transform: translateY(0) rotate(-.35deg); } 50% { transform: translateY(-4px) rotate(.35deg); } }
</style>
