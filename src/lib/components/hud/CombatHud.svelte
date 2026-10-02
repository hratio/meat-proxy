<script lang="ts">
  import { onDestroy, untrack, type Snippet } from 'svelte';
  import { Spring, prefersReducedMotion } from 'svelte/motion';
  import HudChassis from './HudChassis.svelte';
  import FindingPanel from './FindingPanel.svelte';
  import PortraitFrame from './PortraitFrame.svelte';
  import { defaults } from '$lib/config';
  import type { HudSettings } from '$lib/hud-config';
  import type { HudDisplayMode, HudFinding, HudLayout } from './types';
  let { left, right, settings = defaults.hud, layout = settings, mode = 'detailed', leftMode, rightMode, reducedMotion = false, portrait, leftIcon, rightIcon, wireframe = false, exploded = false, docked = false, leftHolster = 0, rightHolster = 0, leftLift = 0, rightLift = 0, leftPosition = 'primary', rightPosition = 'secondary', centerLift = 0, portraitOverflow = false, onleftcycle, onrightcycle, leftIdentity = $bindable(), rightIdentity = $bindable(), codeControlsVisible = false, onwordwrapchange }: {
    left: HudFinding; right: HudFinding; layout?: HudLayout;
    settings?: HudSettings; mode?: HudDisplayMode; reducedMotion?: boolean; docked?: boolean;
    leftMode?: HudDisplayMode; rightMode?: HudDisplayMode;
    leftHolster?: number; rightHolster?: number; leftLift?: number; rightLift?: number;
    leftPosition?: 'primary' | 'secondary'; rightPosition?: 'primary' | 'secondary';
    centerLift?: number; portraitOverflow?: boolean;
    onleftcycle?: (groups: boolean, direction: number) => void;
    onrightcycle?: (groups: boolean, direction: number) => void;
    codeControlsVisible?: boolean; onwordwrapchange?: (enabled: boolean) => void;
    leftIdentity?: HTMLDivElement; rightIdentity?: HTMLDivElement;
    portrait?: Snippet; leftIcon?: Snippet; rightIcon?: Snippet; wireframe?: boolean; exploded?: boolean;
  } = $props();
  let width = $state(1200), height = $state(335);
  let leftWidth = $state(480), leftHeight = $state(290);
  let rightWidth = $state(480), rightHeight = $state(290);
  let leftContentHeight = $state(290), rightContentHeight = $state(290);
  let measuredLeftHeight = $state(290), measuredRightHeight = $state(290);
  $effect(() => {
    const left = measuredLeftHeight, right = measuredRightHeight;
    // Expanding code examples changes their parent panel's holster height.
    // Apply that layout change outside ResizeObserver's delivery cycle.
    const frame = requestAnimationFrame(() => { leftContentHeight = left; rightContentHeight = right; });
    return () => cancelAnimationFrame(frame);
  });
  let centerHeight = $state(274);
  let portraitDrop = $derived(!exploded && (docked || width > 560) ? 4 : 0);
  const panelHeight = (height: number, holster: number, lift: number) =>
    Math.max(settings.holsteredPeek, height * (1 - holster) + settings.holsteredPeek * holster + lift);
  let effectiveLeftMode = $derived(leftMode ?? mode), effectiveRightMode = $derived(rightMode ?? mode);
  let sharedMode = $derived(leftMode === undefined && rightMode === undefined);
  function exampleSpring(getMode: () => HudDisplayMode | undefined) {
    const spring = new Spring(untrack(() => getMode() === 'detailed' ? layout.codeHeight : 0), { precision: .05 });
    $effect(() => {
      spring.stiffness = settings.springStiffness;
      spring.damping = settings.springDamping;
      void spring.set(getMode() === 'detailed' ? layout.codeHeight : 0, { instant: reducedMotion || prefersReducedMotion.current });
    });
    $effect(() => {
      if (getMode() === 'compact' && spring.current < 0) void spring.set(0, { instant: true });
    });
    onDestroy(() => { void spring.set(spring.current, { instant: true }); });
    return spring;
  }
  const leftCode = exampleSpring(() => effectiveLeftMode);
  const rightCode = exampleSpring(() => sharedMode ? undefined : effectiveRightMode);
  // A global lab toggle uses one clock; explicit side modes reveal independently.
  let rightCodeHeight = $derived(sharedMode ? leftCode.current : rightCode.current);
  const reveal = (height: number) => Math.max(0, Math.min(1, height / Math.max(1, layout.codeHeight)));
</script>

<div class="hud-container @container/hud mx-auto w-full" class:hud-wireframe={wireframe} data-mode={effectiveLeftMode === effectiveRightMode ? effectiveLeftMode : 'mixed'} data-left-mode={effectiveLeftMode} data-right-mode={effectiveRightMode} style:max-width={`${layout.width}px`}
  style:--hud-group-size={`${settings.groupSize}px`} style:--hud-title-size={`${settings.titleSize}px`}
  style:--hud-vcode-size={`${settings.vcodeSize}px`} style:--hud-icon-size={`${settings.iconSize}px`}>
  <div class={['combat-assembly relative isolate grid grid-cols-[minmax(0,var(--hud-left))_minmax(140px,var(--hud-center))_minmax(0,var(--hud-right))] items-end drop-shadow-[0_9px_12px_#0008] @max-[760px]/hud:grid-cols-[minmax(0,var(--hud-left))_150px_minmax(0,var(--hud-right))]', exploded ? 'gap-7' : 'gap-(--hud-gap)', docked ? '@max-[560px]/hud:grid-cols-[minmax(0,var(--hud-left))_120px_minmax(0,var(--hud-right))]' : '@max-[560px]/hud:grid-cols-1 @max-[560px]/hud:gap-3']} class:exploded class:docked bind:clientWidth={width} bind:clientHeight={height}
    style:--hud-left={`${layout.leftWeight}fr`} style:--hud-right={`${layout.rightWeight}fr`}
    style:--hud-center={`${layout.centerWidth}px`} style:--hud-gap={`${layout.gap}px`}
    style:--hud-portrait-height={`${layout.portraitHeight}px`}
    style:--hud-code-size={`${layout.codeSize}px`}>
    {#if !exploded && (docked || width > 560)}<HudChassis {width} {height} {leftWidth} {leftHeight} {rightWidth} {rightHeight} centerHeight={centerHeight + centerLift - portraitDrop} gap={layout.gap} />{/if}
    <div class={['left-panel min-w-0 self-end overflow-clip [&_.finding-panel]:h-auto [&_.finding-panel]:w-full', !docked && '@max-[560px]/hud:row-start-2']} data-holstered={leftHolster >= .99} aria-hidden={leftHolster >= .99 && settings.holsteredPeek === 0} bind:clientWidth={leftWidth} bind:clientHeight={leftHeight} style:height={leftHolster === 0 ? undefined : `${panelHeight(leftContentHeight, leftHolster, leftLift)}px`}
      style:--hud-code-height={`${Math.max(0, leftCode.current)}px`} style:--hud-code-reveal={reveal(leftCode.current)}>
      <div bind:clientHeight={measuredLeftHeight}><FindingPanel finding={left} position={leftPosition} icon={leftIcon} compact={effectiveLeftMode === 'compact'} holstered={leftHolster > .1} mirrored oncycle={onleftcycle} bind:identity={leftIdentity}
        codeExpanded={effectiveLeftMode === 'detailed' && leftCode.current === layout.codeHeight && leftHolster === 0} {codeControlsVisible} wordWrap={settings.codeWordWrap} {reducedMotion} {onwordwrapchange} /></div>
    </div>
    <div class={['center-module relative z-1 grid min-w-0', exploded ? 'gap-7' : 'gap-0', !docked && '@max-[560px]/hud:row-start-1 @max-[560px]/hud:w-[min(100%,var(--hud-center))] @max-[560px]/hud:justify-self-center']} bind:clientHeight={centerHeight} style:margin-bottom={`${centerLift}px`} style:transform={`translateY(${portraitDrop}px)`}>
      <PortraitFrame children={portrait} overflow={portraitOverflow} />
    </div>
    <div class={['right-panel min-w-0 self-end overflow-clip [&_.finding-panel]:h-auto [&_.finding-panel]:w-full', !docked && '@max-[560px]/hud:row-start-3']} data-holstered={rightHolster >= .99} aria-hidden={rightHolster >= .99 && settings.holsteredPeek === 0} bind:clientWidth={rightWidth} bind:clientHeight={rightHeight} style:height={rightHolster === 0 ? undefined : `${panelHeight(rightContentHeight, rightHolster, rightLift)}px`}
      style:--hud-code-height={`${Math.max(0, rightCodeHeight)}px`} style:--hud-code-reveal={reveal(rightCodeHeight)}>
      <div bind:clientHeight={measuredRightHeight}><FindingPanel finding={right} position={rightPosition} icon={rightIcon} compact={effectiveRightMode === 'compact'} holstered={rightHolster > .1} oncycle={onrightcycle} bind:identity={rightIdentity}
        codeExpanded={effectiveRightMode === 'detailed' && rightCodeHeight === layout.codeHeight && rightHolster === 0} {codeControlsVisible} wordWrap={settings.codeWordWrap} {reducedMotion} {onwordwrapchange} /></div>
    </div>
    <div class="base-rail col-span-full" aria-hidden="true"></div>
  </div>
</div>
