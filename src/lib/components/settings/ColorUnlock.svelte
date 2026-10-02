<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { Crosshair, LockKeyholeOpen } from '@lucide/svelte';
  import type { Config } from '$lib/config';
  import type { ColorUnlockEvent } from '$lib/game-events/schema';
  import { createWeaponAudio } from '$lib/audio';
  import { weaponProfile } from '$lib/weapons/profiles';
  import { airstrikeModel, airstrikeProfile, createAirstrikeSequence } from '$lib/game-events/color-unlock';
  import { shatterTransmission } from '$lib/game-events/debris';
  import { Button } from '$lib/components/ui/button';
  import HudNotification from '../hud/HudNotification.svelte';
  import AirstrikeOverlay from './AirstrikeOverlay.svelte';
  import CustomShellColors from './CustomShellColors.svelte';

  let { config = $bindable(), active = $bindable(false), onevent }: {
    config: Config; active?: boolean; onevent: (event: ColorUnlockEvent) => void;
  } = $props();
  const reduced = $derived(config.display.reducedMotion || prefersReducedMotion.current);
  const profile = $derived(airstrikeProfile(weaponProfile(airstrikeModel, config.weapons.profiles)));
  const explanation = 'The PM said users might choose colors that make things hard to see. And we can’t risk that!\n\nThis decision is final. Probably.';
  let phase = $state<'idle' | 'ready' | 'pending' | 'inbound' | 'firing' | 'departing'>('idle');
  let preparation = $state<'loading' | 'ready' | 'unavailable'>('loading');
  let impacted = $state(false), elapsed = $state(-1);
  let stage: HTMLDivElement;
  let plate = $state<HTMLDivElement>(), debris = $state<HTMLCanvasElement>(), callButton = $state<HTMLButtonElement | null>(null);
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let stopDebris: (() => void) | undefined;
  let frame = 0, previous = 0, soundActive = false;
  let focused = true;
  const audio = createWeaponAudio(() => {});
  function portalDebris(node: HTMLCanvasElement) {
    node.closest('[data-slot="dialog-content"]')?.appendChild(node);
    return { destroy: () => node.remove() };
  }
  const sequence = createAirstrikeSequence(beat => {
    if (beat === 'burst') { phase = 'firing'; beginBurst(); }
    if (beat === 'impact') {
      if (!reduced && debris && plate) {
        const box = plate.getBoundingClientRect();
        stopDebris = shatterTransmission(debris, plate, { x: box.left + box.width * .6, y: box.top + box.height * .45 }, () => !focused);
      }
      impacted = true;
    }
    if (beat === 'release') { phase = 'departing'; audio.end(0); soundActive = false; }
    if (beat === 'complete') finish();
  });

  async function start() {
    if (active) return;
    impacted = false; preparation = 'loading'; elapsed = -1;
    phase = 'ready'; active = true;
    onevent('color-unlock-start');
    if (config.gameplay.sound && config.gameplay.volume) void audio.preload([profile]);
    // Loading fallback only; unrelated to the flight's animation timing.
    readyTimer = setTimeout(() => prepared(false), 10_000);
    await tick();
    callButton?.focus({ preventScroll: true });
  }
  function prepared(available: boolean) {
    if (!active || preparation !== 'loading') return;
    clearTimeout(readyTimer);
    preparation = available ? 'ready' : 'unavailable';
    if (phase === 'pending') launch();
  }
  function callReinforcements() {
    if (phase !== 'ready') return;
    // Unlock audio within the click gesture; the clock starts firing at burstStartMs.
    audio.begin(0, profile, config.gameplay.sound ? config.gameplay.volume : 0);
    phase = 'pending';
    if (preparation !== 'loading') launch();
  }
  function beginBurst() {
    if (soundActive) return;
    soundActive = true;
    audio.begin(0, profile, config.gameplay.sound ? config.gameplay.volume : 0);
    audio.shot(0);
  }
  function launch() {
    if (!active || phase !== 'pending') return;
    phase = 'inbound'; sequence.start(); elapsed = 0; previous = performance.now();
    const advance = (time: number) => {
      const delta = Math.min(50, Math.max(0, time - previous)); previous = time;
      if (focused) {
        sequence.advance(delta); elapsed = sequence.elapsed;
        if (phase === 'firing') beginBurst();
      }
      if (sequence.running) frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
  }
  function cleanup(cancelSound: boolean) {
    clearTimeout(readyTimer); cancelAnimationFrame(frame); sequence.cancel();
    stopDebris?.(); stopDebris = undefined; elapsed = -1;
    if (cancelSound) audio.end(0, false);
    soundActive = false;
  }
  export function cancel() {
    if (!active) return;
    cleanup(true);
    phase = 'idle'; impacted = false; active = false;
    onevent('color-unlock-cancel');
    void tick().then(() => stage?.querySelector<HTMLButtonElement>('[data-unlock-start]')?.focus({ preventScroll: true }));
  }
  function finish() {
    config.onboarding.colorPickerUnlocked = true;
    // The scheduled echo may outlive the plane. Only cancellation or unmount cuts it short.
    cleanup(false);
    phase = 'idle'; active = false;
    onevent('color-unlock-success');
    void tick().then(() => stage?.querySelector<HTMLInputElement>('input[type="color"]')?.focus({ preventScroll: true }));
  }
  function resetColors() {
    config.display.customColors = false;
    config.display.baseTint = undefined;
    config.display.accent = undefined;
    config.onboarding.colorPickerUnlocked = false;
    void tick().then(() => stage?.querySelector<HTMLButtonElement>('[data-unlock-start]')?.focus({ preventScroll: true }));
  }
  onMount(() => {
    const visibility = () => {
      focused = !document.hidden && document.hasFocus();
      if (!focused) { audio.end(0, false); soundActive = false; }
    };
    visibility();
    window.addEventListener('blur', visibility); window.addEventListener('focus', visibility); document.addEventListener('visibilitychange', visibility);
    return () => {
      cleanup(true); audio.dispose();
      window.removeEventListener('blur', visibility); window.removeEventListener('focus', visibility); document.removeEventListener('visibilitychange', visibility);
      if (active) { active = false; onevent('color-unlock-cancel'); }
    };
  });
</script>

<div bind:this={stage} class="color-unlock mt-6 flex items-center justify-center" data-color-unlock={phase} data-reduced-motion={reduced}>
  {#if config.onboarding.colorPickerUnlocked && !active}
    <CustomShellColors bind:display={config.display} onreset={resetColors} />
  {:else if !active}
    <Button data-unlock-start variant="outline" class="w-fit whitespace-normal" onclick={start}>Why can’t I choose my own colors?</Button>
  {:else}
    <div class="strike-stage" data-impacted={impacted} aria-busy={phase !== 'ready'}>
      <div class="palette-target">
        <div class="covered-palette" inert aria-hidden="true"><CustomShellColors bind:display={config.display} /></div>
        <div bind:this={plate} class="blockade" inert={impacted} aria-hidden={impacted}>
          <HudNotification kind="warning" closable={false} dismiss={() => {}} message="COLOR CHOICE DENIED" description={explanation}>
            {#snippet actions()}
              <div class="flex flex-wrap items-center justify-between gap-3">
                <Button variant="preview" class="border border-white/20 px-4" disabled={phase !== 'ready'} onclick={cancel}>Stand down</Button>
                <Button bind:ref={callButton} variant="preview" class="border border-[#edbf73]/50 bg-[#edbf73]/10 px-4 text-[#edbf73]" disabled={phase !== 'ready'} onclick={callReinforcements}>
                  {phase === 'ready' ? 'Call in reinforcements' : 'Reinforcements inbound…'}
                </Button>
              </div>
            {/snippet}
          </HudNotification>
        </div>
      </div>
      {#if impacted && !reduced}<div class="strike-flash" aria-hidden="true"></div>{/if}
      <canvas use:portalDebris bind:this={debris} class="debris" aria-hidden="true"></canvas>
      <p class="sr-only" role="status">{impacted ? 'Restriction removed. Air support departing.' : phase === 'ready' ? 'Stand down or call in reinforcements.' : 'Air support inbound.'}</p>
    </div>
    {#if plate}<AirstrikeOverlay target={plate} {elapsed} {reduced} {config} showAircraft={preparation === 'ready'} onready={prepared} />{/if}
  {/if}
</div>

<style>
  .strike-stage { position: relative; isolation: isolate; }
  .strike-stage[data-impacted='true'] { overflow: clip; }
  .palette-target { display: grid; position: relative; }
  .covered-palette, .blockade { grid-area: 1 / 1; min-width: 0; }
  .blockade { z-index: 1; }
  .blockade :global(.hud-notification) { height: 100%; }
  .blockade :global(.hud-notification > .hud-frame > .frame-content > div) { height: 100%; }
  .debris { position: absolute; inset: 0; z-index: 31; width: 100%; height: 100%; pointer-events: none; }
  [data-impacted='true'] .blockade { visibility: hidden; }
  .strike-flash { position: absolute; inset: -24px; z-index: 4; border-radius: 50%; pointer-events: none; background: radial-gradient(ellipse, #ffe9b5 0%, #e9aa5970 30%, transparent 70%); animation: strike-impact 360ms ease-out both; }
  @keyframes strike-impact { from { opacity: .9; transform: scale(.7); } to { opacity: 0; transform: scale(1.15); } }
</style>
