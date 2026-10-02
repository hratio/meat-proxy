<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { provideUi } from '$lib/ui/context.svelte';
  import { uiDefaults } from '$lib/ui/defaults';
  import { provideCombat } from '$lib/ui/combat.svelte';
  import { colorProfile, readColorVariables } from '$lib/ui/user-colors';
  import { shellColorProperties, shellColorVariables } from '$lib/ui/shell-colors';
  import { crosshairCursor, defaultCrosshair } from '$lib/crosshair';
  import { backgroundVariables } from '$lib/backgrounds';
  import { defaultBackground } from '$lib/backgrounds/config';

  let { children }: { children: Snippet } = $props();
  const ui = provideUi();
  provideCombat();

  $effect(() => {
    document.documentElement.style.setProperty('--hud-art-tint-strength', String(ui.previewHudTint ?? ui.config?.hud.tintStrength ?? .3));
  });

  $effect(() => {
    const variables = backgroundVariables(ui.previewBackground ?? ui.config?.display.background ?? defaultBackground);
    for (const [key, value] of Object.entries(variables)) document.documentElement.style.setProperty(key, value);
  });

  $effect(() => {
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('--combat-cursor');
    root.style.setProperty('--combat-cursor', crosshairCursor(ui.previewCrosshair ?? ui.config?.crosshair ?? defaultCrosshair));
    return () => {
      if (previous) root.style.setProperty('--combat-cursor', previous);
      else root.style.removeProperty('--combat-cursor');
    };
  });

  $effect(() => {
    document.documentElement.dataset.theme = ui.theme;
    const overrides = shellColorVariables(ui.shellColors);
    for (const key of shellColorProperties) {
      if (overrides[key]) document.documentElement.style.setProperty(key, overrides[key]);
      else document.documentElement.style.removeProperty(key);
    }
    const [accent, ...backgrounds] = readColorVariables(document.documentElement, ['--primary', '--card', '--background', '--popover', '--secondary', '--muted-surface', '--interactive-surface']);
    ui.colorProfile = { theme: ui.theme, profile: colorProfile(accent, backgrounds) };
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
  });

  $effect(() => {
    const display = ui.config?.display;
    if (!display) return;
    const root = document.documentElement;
    const variables = {
      '--ui-font-size': `${display.uiFontSize}px`,
      '--ui-label-size': `${display.uiLabelSize}px`,
      '--ui-motion-duration': `${display.reducedMotion ? 0 : display.uiMotionMs}ms`
    };
    const previous = Object.keys(variables).map(key => [key, root.style.getPropertyValue(key)]);
    const motion = root.dataset.uiReducedMotion;
    for (const [key, value] of Object.entries(variables)) root.style.setProperty(key, value);
    root.dataset.uiReducedMotion = String(display.reducedMotion);
    return () => {
      for (const [key, value] of previous) { if (value) root.style.setProperty(key, value); else root.style.removeProperty(key); }
      if (motion === undefined) delete root.dataset.uiReducedMotion; else root.dataset.uiReducedMotion = motion;
    };
  });
</script>

<!-- Dialogs return focus to their trigger; only keyboard focus should open a tooltip. -->
<Tooltip.Provider ignoreNonKeyboardFocus delayDuration={ui.config?.display.tooltipDelayMs ?? uiDefaults.tooltipDelayMs} skipDelayDuration={ui.config?.display.tooltipSkipDelayMs ?? uiDefaults.tooltipSkipDelayMs}>
  {@render children()}
</Tooltip.Provider>
