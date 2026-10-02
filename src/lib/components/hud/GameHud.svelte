<script lang="ts">
  import { hudColorProfile, userPalette } from '$lib/ui/user-colors';
  import { onDestroy, untrack, type Snippet } from 'svelte';
  import { Spring, prefersReducedMotion } from 'svelte/motion';
  import { createHudCue } from '$lib/hud-cue';
  import { startupTiming, type StartupPhase } from '$lib/startup';
  import type { Catalog, Config, Rule } from '$lib/config';
  import CombatHud from './CombatHud.svelte';
  import VcodeNavigator from './VcodeNavigator.svelte';
  import VImage from '../VImage.svelte';
  import type { HudFinding } from './types';

  let { config, primaryGroup, secondaryGroup, primaryRule, secondaryRule, mainDrawn, secondaryDrawn, portrait, oncycle, onwordwrapchange, startup = 'ready', entranceMs = 0, onstartupcomplete, clearance = $bindable(0), railClearance = $bindable(0), navigating = $bindable(false) }: {
    config: Config; primaryGroup: Catalog['groups'][number]; secondaryGroup: Catalog['groups'][number];
    primaryRule: Rule; secondaryRule: Rule; mainDrawn: boolean; secondaryDrawn: boolean;
    portrait: Snippet; clearance?: number; railClearance?: number;
    navigating?: boolean;
    oncycle: (secondary: boolean, groups: boolean, direction: number) => void;
    onwordwrapchange: (enabled: boolean) => void;
    startup?: StartupPhase;
    entranceMs?: number;
    onstartupcomplete?: (phase: 'bar' | 'portrait') => void;
  } = $props();
  let height = $state(0);
  let mainIdentity = $state<HTMLDivElement>(), secondaryIdentity = $state<HTMLDivElement>();
  let mainNavigatorClearance = $state(0), secondaryNavigatorClearance = $state(0);
  let mainRailClearance = $state(0), secondaryRailClearance = $state(0);
  let navigatorLayout = $derived(JSON.stringify(config.display));
  let mainPeek = $state(false), secondaryPeek = $state(false);
  let mainNavigating = $state(false), secondaryNavigating = $state(false);
  let mainNavigatorVisible = $derived(config.hud.navigatorEnabled && mainDrawn && (config.hud.navigatorAlwaysVisible || mainNavigating));
  let secondaryNavigatorVisible = $derived(config.hud.navigatorEnabled && secondaryDrawn && (config.hud.navigatorAlwaysVisible || secondaryNavigating));
  const mainPanel = new Spring(untrack(() => mainDrawn ? 0 : 1));
  const secondaryPanel = new Spring(untrack(() => secondaryDrawn ? 0 : 1));
  const move = (spring: Spring<number>, drawn: boolean) => {
    void spring.set(drawn ? 0 : 1, { instant: config.display.reducedMotion || prefersReducedMotion.current });
  };
  const mainCue = createHudCue(drawn => move(mainPanel, drawn), visible => mainPeek = visible, visible => mainNavigating = visible);
  const secondaryCue = createHudCue(drawn => move(secondaryPanel, drawn), visible => secondaryPeek = visible, visible => secondaryNavigating = visible);
  const heldAreas = new Set<string>();
  let held = $state(false);
  function hold(area: string, active: boolean) {
    if (active) heldAreas.add(area); else heldAreas.delete(area);
    held = heldAreas.size > 0;
    mainCue.hold(held); secondaryCue.hold(held);
  }
  $effect(() => {
    for (const spring of [mainPanel, secondaryPanel]) {
      spring.stiffness = config.weapons.holsterStiffness;
      spring.damping = config.weapons.holsterDamping;
    }
  });
  $effect(() => {
    const cue = { drawn: mainDrawn, selection: `${primaryGroup.id}:${primaryRule.id}`, delayMs: config.hud.weaponDelayMs, peekMs: config.hud.codePeekMs };
    untrack(() => mainCue.update(cue));
  });
  $effect(() => {
    const cue = { drawn: secondaryDrawn, selection: `${secondaryGroup.id}:${secondaryRule.id}`, delayMs: config.hud.weaponDelayMs, peekMs: config.hud.codePeekMs };
    untrack(() => secondaryCue.update(cue));
  });
  let previousStartup: StartupPhase = 'waiting';
  $effect(() => {
    const phase = startup;
    // Opting out (including reduced motion) presents the saved loadout at once.
    if (phase === 'ready' && previousStartup !== 'weapons') untrack(() => {
      void mainPanel.set(mainDrawn ? 0 : 1, { instant: true });
      void secondaryPanel.set(secondaryDrawn ? 0 : 1, { instant: true });
    });
    previousStartup = phase;
  });
  function entranceEnded(event: AnimationEvent) {
    if (startup === 'bar' && event.target === event.currentTarget) onstartupcomplete?.('bar');
    if (startup === 'portrait' && event.target instanceof Element && event.target.classList.contains('center-module')) onstartupcomplete?.('portrait');
  }
  onDestroy(() => {
    mainCue.dispose(); secondaryCue.dispose();
    clearance = 0; railClearance = 0;
    navigating = false;
    for (const spring of [mainPanel, secondaryPanel]) void spring.set(spring.current, { instant: true });
  });
  const lift = (progress: number) => Math.sin(Math.PI * Math.max(0, Math.min(1, progress))) * config.weapons.holsterCardLiftPx;
  $effect(() => {
    navigating = mainNavigatorVisible || secondaryNavigatorVisible;
    clearance = Math.max(height + config.hud.bottom,
      mainNavigatorVisible ? mainNavigatorClearance : 0,
      secondaryNavigatorVisible ? secondaryNavigatorClearance : 0);
    railClearance = Math.max(
      mainNavigatorVisible ? mainRailClearance : 0,
      secondaryNavigatorVisible ? secondaryRailClearance : 0);
  });
  function finding(group: Catalog['groups'][number], rule: Rule): HudFinding {
    return { group: group.name, code: rule.id, title: rule.title, color: userPalette(group.color, hudColorProfile).foreground,
      icon: config.hud.iconStyle === 'catalog' ? 'skull' : config.hud.iconStyle, example: rule.bad || '' };
  }
</script>

{#snippet primaryIcon()}<VImage index={primaryRule.image} size={config.hud.iconSize} fill />{/snippet}
{#snippet secondaryIcon()}<VImage index={secondaryRule.image} size={config.hud.iconSize} fill />{/snippet}
{#snippet head()}
  <div class="game-portrait absolute inset-0">{@render portrait()}</div>
{/snippet}

<footer class="game-hud pointer-events-none absolute left-1/2 z-18 -translate-x-1/2" aria-label="Combat HUD" data-cursor="native" bind:clientHeight={height}
  class:together={entranceMs > 0} style:--entrance-duration={`${entranceMs}ms`} data-startup={startup} onanimationend={entranceEnded}
  style:--startup-drop={`${config.hud.bottom + 50}px`} style:--bar-duration={`${startupTiming.bar}ms`} style:--portrait-duration={`${startupTiming.portrait}ms`}
  onpointerenter={() => hold('hud', true)} onpointerleave={() => hold('hud', false)}
  onfocusin={event => { if (event.target instanceof Element && event.target.matches(':focus-visible')) hold('hud-focus', true); }}
  onfocusout={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hold('hud-focus', false); }}
  style:bottom={`${config.hud.bottom}px`} style:width={`min(${config.hud.width}px, calc(100% - 20px))`}>
  <CombatHud settings={config.hud} left={finding(secondaryGroup, secondaryRule)} right={finding(primaryGroup, primaryRule)}
    bind:leftIdentity={secondaryIdentity} bind:rightIdentity={mainIdentity}
    reducedMotion={config.display.reducedMotion} docked portrait={head}
    codeControlsVisible={held && startup === 'ready'} {onwordwrapchange}
    leftPosition="secondary" rightPosition="primary"
    onleftcycle={(groups, direction) => oncycle(true, groups, direction)}
    onrightcycle={(groups, direction) => oncycle(false, groups, direction)}
    leftMode={config.hud.alwaysShowCode || secondaryPeek ? 'detailed' : 'compact'}
    rightMode={config.hud.alwaysShowCode || mainPeek ? 'detailed' : 'compact'}
    leftHolster={secondaryPanel.current} rightHolster={mainPanel.current} leftLift={lift(secondaryPanel.current)} rightLift={lift(mainPanel.current)}
    leftIcon={config.hud.iconStyle === 'catalog' ? secondaryIcon : undefined}
    rightIcon={config.hud.iconStyle === 'catalog' ? primaryIcon : undefined} />
</footer>

{#if mainNavigatorVisible}
  <VcodeNavigator group={primaryGroup} selected={primaryRule.id} anchor={mainIdentity} side="right" settings={config.hud}
    onhover={active => hold('primary-navigator', active)} oncycle={direction => oncycle(false, false, direction)}
    inset={config.display.chromeInsetPx} layoutKey={navigatorLayout} reducedMotion={config.display.reducedMotion} bind:clearance={mainNavigatorClearance} bind:railClearance={mainRailClearance} />
{/if}

{#if secondaryNavigatorVisible}
  <VcodeNavigator group={secondaryGroup} selected={secondaryRule.id} anchor={secondaryIdentity} side="left" settings={config.hud}
    onhover={active => hold('secondary-navigator', active)} oncycle={direction => oncycle(true, false, direction)}
    inset={config.display.chromeInsetPx} layoutKey={navigatorLayout} reducedMotion={config.display.reducedMotion} bind:clearance={secondaryNavigatorClearance} bind:railClearance={secondaryRailClearance} />
{/if}

<style>
  .game-hud :global(:is(.left-panel, .right-panel, .center-module, .base-rail)) { pointer-events: auto; }
  .game-hud.together[data-startup='weapons'] { animation: bar-enter var(--entrance-duration) cubic-bezier(.16, 1, .3, 1) both; }
  .game-hud.together[data-startup='weapons'] :global(.center-module) { animation: portrait-enter var(--entrance-duration) cubic-bezier(.16, 1, .3, 1) both; }
  .game-hud[data-startup='waiting'] { visibility: hidden; transform: translateY(var(--startup-drop)); }
  .game-hud[data-startup='bar'] { animation: bar-enter var(--bar-duration) cubic-bezier(.16, 1, .3, 1) both; }
  .game-hud:is([data-startup='waiting'], [data-startup='bar']) :global(.center-module) {
    visibility: hidden; translate: 0 calc(100% + var(--startup-drop));
  }
  .game-hud:is([data-startup='waiting'], [data-startup='bar']) :global(.chassis) { clip-path: inset(calc(100% - 30px) 0 0); }
  .game-hud[data-startup='portrait'] :global(.center-module) { animation: portrait-enter var(--portrait-duration) cubic-bezier(.16, 1, .3, 1) both; }
  .game-hud[data-startup='portrait'] :global(.chassis) { animation: chassis-enter var(--portrait-duration) cubic-bezier(.16, 1, .3, 1) both; }
  .game-hud:is([data-startup='waiting'], [data-startup='bar'], [data-startup='portrait'], [data-startup='shutter']) :global(:is(.left-panel, .right-panel)) { visibility: hidden; }
  @keyframes bar-enter { from { transform: translateY(var(--startup-drop)); } to { transform: translateY(0); } }
  @keyframes portrait-enter { from { translate: 0 calc(100% + var(--startup-drop)); } to { translate: 0 0; } }
  @keyframes chassis-enter { from { clip-path: inset(calc(100% - 30px) 0 0); } to { clip-path: inset(0); } }
</style>
