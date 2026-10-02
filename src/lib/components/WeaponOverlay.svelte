<script lang="ts">
  import { untrack } from 'svelte';
  import type { Config } from '$lib/config';
  import type { WeaponState, WeaponEvent } from '$lib/weapons/renderer';
  import { createRenderHost } from '$lib/render/host';
  import { isUiKeyboardEvent } from '$lib/ui/interaction';
  import { useCombat } from '$lib/ui/combat.svelte';
  let { config, anchor, paused = false, trackingPaused = false, mainModel, secondaryModel, mainDrawn, secondaryDrawn, mainHolster, secondaryHolster, mainShot, secondaryShot, mainShotCharge = 0, secondaryShotCharge = 0, mainFiringSince, secondaryFiringSince, reload, pointer, onready }: {
    config: Config; anchor?: HTMLElement; paused?: boolean; trackingPaused?: boolean; mainModel?: string; secondaryModel?: string; mainDrawn: boolean; secondaryDrawn: boolean; mainHolster: number; secondaryHolster: number; mainShot: number; secondaryShot: number; mainFiringSince: number; secondaryFiringSince: number; reload: number; pointer: { x: number; y: number };
    onready?: (slot: number, model: string) => void;
    mainShotCharge?: number; secondaryShotCharge?: number;
  } = $props();
  const combat = useCombat();
  let canvas = $state<HTMLCanvasElement>();
  let generation = $state(0), forceMain = false;
  let failed = $state(false), modelReady = $state([false, false]);
  let host = $state.raw<ReturnType<typeof createRenderHost<WeaponState, WeaponEvent>>>();
  export function clearEffects() { host?.input({ type: 'blur' }); }
  let measureLayout: (() => void) | undefined;
  const settings = $derived({ weapons: config.weapons, gloves: config.gloves,
    display: { reducedMotion: config.display.reducedMotion }, gameplay: { reloadMs: config.gameplay.reloadMs } });
  // Keep real pointer input available to the review UI while the weapon holds
  // its last aim. Releasing the final UI hold picks up the current pointer.
  let weaponPointer = $state(untrack(() => ({ ...pointer })));
  $effect(() => { if (!trackingPaused) weaponPointer = { ...pointer }; });
  const motion = $derived({ paused, mainModel, secondaryModel, mainDrawn, secondaryDrawn, mainHolster, secondaryHolster,
    mainShot, secondaryShot, mainShotCharge, secondaryShotCharge, mainFiringSince, secondaryFiringSince, reload, pointer: weaponPointer });
  $effect(() => { host?.update($state.snapshot(motion)); });
  $effect(() => { host?.update({ config: $state.snapshot(settings) }); });
  $effect(() => { anchor; untrack(() => measureLayout?.()); });

  $effect(() => {
    if (!canvas) return;
    const node = canvas;
    return untrack(() => {
      failed = false; modelReady = [false, false];
      let layoutFrame = 0;
      const size = () => ({ width: Math.max(1, node.clientWidth), height: Math.max(1, node.clientHeight), pixelRatio: devicePixelRatio });
      const rect = (element: HTMLElement) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        return { left, top, width, height };
      };
      const layout = () => ({ bounds: rect(node), placement: rect(anchor || node) });
      const failure = (reason: unknown) => {
        failed = true; console.warn('Weapons unavailable:', reason);
        onready?.(0, mainModel || config.weapons.mainModel); onready?.(1, secondaryModel || config.weapons.secondaryModel);
      };
      const current = createRenderHost<WeaponState, WeaponEvent>({
        kind: 'weapons', canvas: node, forceMain, size: size(),
        state: { ...$state.snapshot(motion), config: $state.snapshot(settings), hidden: document.hidden, layout: layout() },
        fallback: () => { forceMain = true; generation++; }, failure,
        event(event) {
          if (event.type === 'error') { failed = true; console.warn('Weapon preparation:', event.message); }
          else { modelReady[event.slot] = event.ready; onready?.(event.slot, event.url); }
        }
      });
      host = current;
      const measure = () => {
        layoutFrame = 0;
        if (anchor) observer.observe(anchor);
        current.resize(size()); current.update({ layout: layout() });
      };
      const schedule = () => { if (!layoutFrame) layoutFrame = requestAnimationFrame(measure); };
      measureLayout = schedule;
      const observer = new ResizeObserver(schedule); observer.observe(node); if (anchor) observer.observe(anchor);
      const keyDown = (event: KeyboardEvent) => { if (!paused && !isUiKeyboardEvent(event, combat.keyboardNavigation)) current.input({ type: 'keydown', code: event.code }); };
      const keyUp = (event: KeyboardEvent) => current.input({ type: 'keyup', code: event.code });
      const blur = () => current.input({ type: 'blur' });
      const visibility = () => current.update({ hidden: document.hidden });
      window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur);
      window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
      document.addEventListener('visibilitychange', visibility);
      return () => {
        current.dispose(); observer.disconnect(); cancelAnimationFrame(layoutFrame);
        window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur);
        window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true);
        document.removeEventListener('visibilitychange', visibility);
        if (host === current) host = undefined;
        if (measureLayout === schedule) measureLayout = undefined;
      };
    });
  });
</script>

{#key generation}
  <canvas class="weapon-overlay pointer-events-none absolute inset-0 z-12 size-full" bind:this={canvas} aria-hidden="true" data-main-model={mainModel} data-secondary-model={secondaryModel} data-main-holster={mainHolster} data-secondary-holster={secondaryHolster} data-main-ready={modelReady[0]} data-secondary-ready={modelReady[1]}></canvas>
{/key}
{#if failed}<div class="absolute right-5 bottom-[135px] text-[11px] text-muted-foreground">3D unavailable · reviewing still works</div>{/if}
