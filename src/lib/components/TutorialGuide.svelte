<script lang="ts">
  import { onDestroy } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { ArrowRight, Crosshair, Check, Radio } from '@lucide/svelte';
  import HudFrame from './hud/HudFrame.svelte';
  import HudAvatar from './HudAvatar.svelte';
  import type { AvatarPresentation } from '$lib/avatar/presentation';
  import type { TutorialGuideOptions } from '$lib/tutorial/content';
  import { placeTutorial, type Rect } from '$lib/tutorial/placement';

  let { message, step, index, total, target, targetScope, presentation, reducedMotion = false, embedded = false, onnext, onskip, onreveal, onaction }: TutorialGuideOptions & {
    presentation: AvatarPresentation; reducedMotion?: boolean; embedded?: boolean;
  } = $props();
  let panel = $state<HTMLElement>();
  let position = $state({ left: 0, top: 0, width: 372, height: 400 });
  let highlight = $state<Rect>();
  let measured = $state(false);
  let portraitReady = $state(false), portraitFrame = 0;
  const reduced = $derived(reducedMotion || prefersReducedMotion.current);
  const titleId = $props.id();
  function portal(node: HTMLElement) { if (embedded) return; document.body.appendChild(node); return { destroy: () => node.remove() }; }
  function prepared(ready: boolean) {
    cancelAnimationFrame(portraitFrame);
    if (!ready) { portraitReady = false; return; }
    // Give the worker's first rendered frame time to reach the compositor.
    portraitFrame = requestAnimationFrame(() => { portraitFrame = requestAnimationFrame(() => portraitReady = true); });
  }
  onDestroy(() => cancelAnimationFrame(portraitFrame));

  $effect(() => {
    if (!panel) return;
    step; target; targetScope; message; embedded;
    let frame = 0, observed: Element | undefined, observedScope: Node | undefined;
    const measure = () => {
      const viewport = window.visualViewport;
      const visible = { left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
        width: viewport?.width || innerWidth, height: viewport?.height || innerHeight };
      // Virtualized code can appear inside a shadow root after scrolling stops.
      const scope = (embedded ? panel?.closest('[role="dialog"]') : targetScope?.()) ?? undefined;
      if (scope !== observedScope) { scopedMutations.disconnect(); if (scope) scopedMutations.observe(scope, { childList: true, subtree: true }); observedScope = scope; }
      const element = target();
      if (element !== observed) {
        if (observed) { observer.unobserve(observed); if (embedded) observed.removeAttribute('data-tutorial-highlight'); }
        if (element) { observer.observe(element); if (embedded) element.setAttribute('data-tutorial-highlight', ''); }
        observed = element;
      }
      if (embedded) { measured = true; return; }
      const bounds = element?.getBoundingClientRect();
      const left = Math.max(visible.left + 4, bounds?.left ?? 0), top = Math.max(visible.top + 4, bounds?.top ?? 0);
      const right = Math.min(visible.left + visible.width - 4, bounds?.right ?? 0), bottom = Math.min(visible.top + visible.height - 4, bounds?.bottom ?? 0);
      const nextHighlight = bounds && right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : undefined;
      const next = placeTutorial(visible, { width: 372, height: panel!.scrollHeight }, nextHighlight, message.placement);
      if (JSON.stringify(highlight) !== JSON.stringify(nextHighlight)) highlight = nextHighlight;
      if (JSON.stringify(position) !== JSON.stringify(next)) position = next;
      measured = true;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(panel); observer.observe(document.documentElement);
    const mutations = new MutationObserver(schedule);
    const scopedMutations = new MutationObserver(schedule);
    mutations.observe(document.querySelector('.arena') || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ready', 'data-reviewed'] });
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    schedule();
    return () => { if (embedded) observed?.removeAttribute('data-tutorial-highlight'); cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); scopedMutations.disconnect(); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); };
  });

  function advance(event: MouseEvent) {
    // Return shortcut ownership to the arena after using the guide's controls.
    (event.currentTarget as HTMLElement).blur();
    onnext();
  }
  const connector = $derived.by(() => {
    if (!highlight) return '';
    const x = Math.max(highlight.left, Math.min(position.left + position.width / 2, highlight.left + highlight.width));
    const y = Math.max(highlight.top, Math.min(position.top + position.height / 2, highlight.top + highlight.height));
    const px = Math.max(position.left, Math.min(x, position.left + position.width));
    const py = Math.max(position.top + 18, Math.min(y, position.top + position.height - 18));
    return `M ${px} ${py} L ${(px + x) / 2} ${py} L ${x} ${y}`;
  });
</script>

<div use:portal class="tutorial-layer" class:embedded data-tutorial-step={step} data-reduced-motion={reduced} data-ready={measured}>
  {#if highlight && !embedded}
    <svg class="tutorial-connector" aria-hidden="true"><path d={connector} /></svg>
    <div class="tutorial-target" aria-hidden="true" style:left={`${highlight.left - 5}px`} style:top={`${highlight.top - 5}px`} style:width={`${highlight.width + 10}px`} style:height={`${highlight.height + 10}px`}></div>
  {/if}
  <section bind:this={panel} class="tutorial-card" aria-label="First steps" aria-describedby={titleId} data-cursor="native" data-ui-layer
    style:left={embedded ? undefined : `${position.left}px`} style:top={embedded ? undefined : `${position.top}px`} style:width={embedded ? undefined : `${position.width}px`} style:max-height={embedded ? undefined : `${position.height}px`}>
    {#snippet contents()}
      <div class="tutorial-content">
        <header class="tutorial-comms">
          {#if !embedded}<div class="tutorial-portrait" aria-hidden="true" data-portrait-ready={portraitReady}>
            <HudAvatar effects={presentation.effects} effectOverrides={presentation.effectOverrides} effectsEnabled={presentation.effectsEnabled && !reduced}
              tilt={presentation.tilt} motion={presentation.motion} framing={presentation.framing} quality={presentation.quality} reducedMotion={reduced} onprepared={prepared} />
            {#if !portraitReady}<div class="tutorial-connecting"><Radio size={20} /><span>CONNECTING</span></div>{/if}
          </div>{/if}
          <div class="tutorial-station"><span><Radio size={12} /> MOCKDADDY // FIELD COMMS</span><strong>FIRST STEPS</strong><small><i></i> UPLINK ESTABLISHED</small></div>
          <span class="tutorial-counter">{String(Math.min(index + 1, total)).padStart(2, '0')}<small> / {String(total).padStart(2, '0')}</small></span>
        </header>
        <div class="tutorial-progress" role="progressbar" aria-label="Tutorial progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(index + 1, total)}>
          {#each Array(total) as _, i}<span class:complete={i < index} class:current={i === index}></span>{/each}
        </div>
        <div class="tutorial-message" aria-live="polite" aria-atomic="true">
          <p class="tutorial-eyebrow">{message.label}</p>
          <h2 id={titleId}>{message.title}</h2>
          <p class="tutorial-copy">{message.text}</p>
        </div>
        {#if message.keys?.length}
          <dl class="tutorial-keys">{#each message.keys as key}<div><dt>{key.label}</dt><dd><kbd>{key.value}</kbd></dd></div>{/each}</dl>
        {/if}
        {#if message.note}<p class="tutorial-note">{message.note}</p>{/if}
        {#if message.action && onaction}<button type="button" class="tutorial-reveal" onclick={onaction}>{message.action} <span aria-hidden="true">↗</span></button>{/if}
        {#if message.task}<div class="tutorial-task"><Crosshair size={15} /><span>{message.task}</span></div>{/if}
        <footer class="tutorial-actions">
          {#if step !== 'done'}<button type="button" class="tutorial-skip" onclick={onskip} title="Dismiss permanently. Replay anytime from the field manual.">Skip tutorial</button>{/if}
          {#if message.button}<button type="button" class="tutorial-next" onclick={advance}>{message.button}{#if step === 'done'}<Check size={15} />{:else}<ArrowRight size={15} />{/if}</button>
          {:else if !embedded && measured && !highlight && message.reveal && onreveal}<button type="button" class="tutorial-reveal" onclick={event => { event.currentTarget.blur(); onreveal?.(); }}>{message.reveal} <span aria-hidden="true">↗</span></button>{/if}
        </footer>
      </div>
    {/snippet}
    {#if embedded}{@render contents()}{:else}<HudFrame>{@render contents()}</HudFrame>{/if}
  </section>
</div>

<style>
  .tutorial-layer { position: fixed; inset: 0; z-index: 95; pointer-events: none; --training-accent: #eac078; color: #e9e6dc; }
  .tutorial-layer[data-ready='false'] { opacity: 0; }
  .tutorial-layer[data-ready='false'] .tutorial-card { pointer-events: none; }
  .tutorial-connector { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .tutorial-connector path { fill: none; stroke: var(--training-accent); stroke-width: 1; opacity: .6; }
  .tutorial-target { position: fixed; border: 1px solid #eac07899; border-radius: 5px; box-shadow: 0 0 0 3px #eac07813, 0 0 22px #eac07819; background: #eac07808; }
  .tutorial-target::before, .tutorial-target::after { content: ''; position: absolute; width: 10px; height: 10px; border-color: var(--training-accent); border-style: solid; }
  .tutorial-target::before { left: -2px; top: -2px; border-width: 2px 0 0 2px; }
  .tutorial-target::after { right: -2px; bottom: -2px; border-width: 0 2px 2px 0; }
  .tutorial-card { position: fixed; pointer-events: auto; overflow-y: auto; overscroll-behavior: contain; filter: drop-shadow(0 12px 28px #000b); outline: none; }
  .tutorial-content { padding: 30px 28px 29px; background: radial-gradient(ellipse at 0 0, #eac0780b, transparent 65%); }
  .tutorial-comms { display: flex; align-items: center; gap: 12px; }
  .tutorial-portrait { position: relative; flex: 0 0 57px; height: 67px; border: 1px solid #eac07844; border-radius: 3px; background: #131719; overflow: hidden; }
  .tutorial-connecting { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 7px; background: #131719; color: var(--training-accent); }
  .tutorial-connecting span { font: 6px/1 var(--mono); letter-spacing: .02em; }
  .tutorial-station { flex: 1; min-width: 0; display: grid; gap: 5px; }
  .tutorial-station > span { display: flex; align-items: center; gap: 5px; color: var(--training-accent); font: 9px/1.3 var(--mono); letter-spacing: .035em; }
  .tutorial-station strong { font: 700 19px/1 var(--display); letter-spacing: .065em; }
  .tutorial-station small { display: flex; align-items: center; gap: 5px; color: #969b92; font: 7px/1.3 var(--mono); letter-spacing: .02em; }
  .tutorial-station i { width: 4px; height: 4px; border-radius: 50%; background: #a7be8b; box-shadow: 0 0 5px #a7be8b60; }
  .tutorial-counter { align-self: flex-start; margin-top: 6px; color: var(--training-accent); font: 13px/1 var(--mono); white-space: nowrap; }
  .tutorial-counter small { color: #969b92; font-size: 9px; }
  .tutorial-progress { display: flex; gap: 4px; margin: 17px 0 22px; }
  .tutorial-progress span { flex: 1; height: 3px; background: #ffffff16; border-radius: 1px; }
  .tutorial-progress span.complete { background: #eac07866; } .tutorial-progress span.current { background: var(--training-accent); box-shadow: 0 0 7px #eac07833; }
  .tutorial-eyebrow { margin: 0 0 6px; color: var(--training-accent); font: 9px/1.4 var(--mono); letter-spacing: .14em; }
  h2 { margin: 0 0 10px; color: #f5f0e6; font: 700 29px/1.08 var(--display); letter-spacing: .015em; }
  .tutorial-copy { margin: 0; font: 13px/1.6 var(--font-sans, sans-serif); color: #dddcd4; }
  .tutorial-keys { display: grid; gap: 8px; margin: 15px 0 0; padding: 12px 0; border-block: 1px solid #ffffff12; font: 11px/1.4 var(--font-sans, sans-serif); }
  .tutorial-keys div { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  dt { color: #b3b6ac; } dd { margin: 0; text-align: right; } kbd { color: #eae4d4; padding: 3px 6px; font: 10px/1.4 var(--mono); background: #ffffff09; border: 1px solid #ffffff24; border-bottom-width: 2px; border-radius: 3px; }
  .tutorial-note { margin: 13px 0 0; color: #a3a79d; font: 11px/1.6 var(--font-sans, sans-serif); }
  .tutorial-task { display: flex; align-items: center; gap: 9px; margin-top: 17px; padding: 10px 11px; border: 1px solid #eac07824; border-radius: 4px; background: #eac07808; color: var(--training-accent); font: 11px/1.5 var(--font-sans, sans-serif); }
  .tutorial-task :global(svg) { flex-shrink: 0; }
  .tutorial-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 20px; }
  button { cursor: pointer; font: 11px/1.4 var(--font-sans, sans-serif); border-radius: 4px; }
  button:focus-visible { outline: 2px solid var(--training-accent); outline-offset: 4px; }
  .tutorial-skip { padding: 7px 0; color: #a3a79d; text-decoration: underline; text-underline-offset: 3px; }
  .tutorial-skip:hover { color: #e9e6dc; }
  .tutorial-next { display: flex; align-items: center; justify-content: center; gap: 9px; margin-left: auto; padding: 10px 13px; background: #eac078; color: #211d16; font-weight: 650; border: 1px solid #f1d49c; box-shadow: 0 2px 0 #86704b; }
  .tutorial-next:hover { background: #f1d49c; }
  .tutorial-reveal { padding: 7px 0; color: var(--training-accent); }
  .tutorial-layer.embedded { position: relative; inset: auto; z-index: auto; flex: none; border-bottom: 1px solid #eac07833; background: #151c16; }
  .embedded .tutorial-card { position: relative; filter: none; overflow: visible; }
  .embedded .tutorial-content { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 20px; padding: 14px 24px; }
  .embedded .tutorial-comms { grid-column: 1 / -1; gap: 8px; }
  .embedded .tutorial-station strong, .embedded .tutorial-station small, .embedded .tutorial-progress, .embedded .tutorial-eyebrow { display: none; }
  .embedded .tutorial-counter { margin: 0; font-size: 10px; }
  .embedded .tutorial-message, .embedded .tutorial-note { grid-column: 1 / -1; }
  .embedded h2 { font-size: 20px; margin-bottom: 4px; }
  .embedded .tutorial-copy { font-size: 12px; line-height: 1.5; }
  .embedded .tutorial-note { margin: 0; }
  .embedded .tutorial-task { margin: 0; padding: 0; border: 0; background: none; }
  .embedded .tutorial-actions { margin: 0; justify-content: end; grid-column: 2; }
  .embedded .tutorial-next { padding: 6px 10px; }
  :global([data-tutorial-highlight]) { outline: 2px solid #eac078; outline-offset: 3px; }
  .tutorial-layer[data-reduced-motion='false'] .tutorial-card { animation: tutorial-arrive 200ms ease-out; }
  @keyframes tutorial-arrive { from { opacity: 0; translate: 0 6px; } to { opacity: 1; translate: 0 0; } }
  @media (max-width: 420px), (max-height: 600px) { .tutorial-content { padding: 24px; } .tutorial-portrait { height: 52px; flex-basis: 46px; } .tutorial-progress { margin-block: 12px 15px; } h2 { font-size: 25px; } }
</style>
