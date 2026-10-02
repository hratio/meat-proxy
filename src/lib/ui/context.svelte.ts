import { getContext, setContext } from 'svelte';
import type { Config } from '$lib/config';
import { defaultShellTheme, isShellTheme, type ShellTheme } from './shell-themes';
import { darkColorProfile, type ColorProfile } from './user-colors';
import type { ShellColors } from './shell-colors';
import type { CrosshairConfig } from '$lib/crosshair';
import type { BackgroundConfig } from '$lib/backgrounds/config';

const key = Symbol('meat-proxy-ui');

class UiState {
  config = $state<Config>();
  previewCrosshair = $state<CrosshairConfig>();
  previewBackground = $state<BackgroundConfig>();
  previewTheme = $state<ShellTheme>();
  previewColors = $state<ShellColors>();
  previewHudTint = $state<number>();
  rememberedColors = $state<ShellColors>(typeof document === 'undefined' ? {} : {
    customColors: !!(document.documentElement.style.getPropertyValue('--shell-accent') || document.documentElement.style.getPropertyValue('--shell-tint')),
    baseTint: document.documentElement.style.getPropertyValue('--shell-tint') || undefined,
    accent: document.documentElement.style.getPropertyValue('--shell-accent') || undefined
  });
  shellColors = $derived(this.previewColors ?? this.config?.display ?? this.rememberedColors);
  // Keep the server-selected palette while the bootstrap request is loading.
  private initialTheme = typeof document === 'undefined' ? defaultShellTheme : document.documentElement.dataset.theme;
  rememberedTheme = $state<ShellTheme>(isShellTheme(this.initialTheme) ? this.initialTheme : defaultShellTheme);
  theme = $derived(this.previewTheme ?? this.config?.display.shellTheme ?? this.rememberedTheme);
  colorProfile = $state.raw<{ theme: ShellTheme; profile: ColorProfile }>();
  colors = $derived(this.colorProfile?.theme === this.theme ? this.colorProfile.profile : darkColorProfile);
}

export function provideUi() { return setContext(key, new UiState()); }
export function useUi() { return getContext<UiState>(key); }
