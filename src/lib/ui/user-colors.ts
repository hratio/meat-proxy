import { clampChroma, converter, formatHex, interpolate, wcagContrast, wcagLuminance } from 'culori';

const toOklch = converter('oklch');
export type ColorProfile = { lightness: number; chroma: number; backgrounds: string[] };
export type UserPalette = { foreground: string; background: string; onSolid: string };

export function colorHue(seed: string): number | undefined {
  const color = toOklch(seed);
  return color && color.c >= .005 ? color.h : undefined;
}

export function hueSeed(hue: number): string {
  return formatHex(clampChroma({ mode: 'oklch', l: .65, c: .16, h: hue }, 'oklch'))!;
}

export function colorOpacityPercent(color: string): number {
  return color.length === 9 ? Math.round(parseInt(color.slice(7), 16) / 255 * 100) : 100;
}

export function withColorOpacity(color: string, percent: number): string {
  const alpha = Math.round(Math.max(0, Math.min(100, percent)) / 100 * 255);
  return alpha === 255 ? color.slice(0, 7) : `${color.slice(0, 7)}${alpha.toString(16).padStart(2, '0')}`;
}

export function colorProfile(accent: string, backgrounds: string[]): ColorProfile {
  const dark = wcagLuminance(backgrounds[0]) < .179;
  const tone = toOklch(accent)!;
  return {
    lightness: dark ? Math.max(.7, Math.min(.8, tone.l)) : Math.max(.4, Math.min(.5, tone.l)),
    chroma: Math.max(.08, Math.min(.14, tone.c)),
    backgrounds
  };
}

export const darkColorProfile = colorProfile('#e9aa59', ['#11120f', '#333b2c']);
export const lightColorProfile = colorProfile('#245dc1', ['#ffffff', '#dfe6f0']);
// HUD wells retain their dark artwork palette even when the shell is light.
export const hudColorProfile = colorProfile('#e9aa59', ['#080e0b', '#353830']);

const cache = new WeakMap<ColorProfile, Map<string, UserPalette>>();

export function userPalette(seed: string, profile: ColorProfile, minimumContrast = 4.5): UserPalette {
  let colors = cache.get(profile);
  if (!colors) { colors = new Map(); cache.set(profile, colors); }
  const key = `${seed}:${minimumContrast}`;
  const cached = colors.get(key);
  if (cached) return cached;
  const hue = colorHue(seed);
  const colorAt = (lightness: number) => formatHex(clampChroma({
    mode: 'oklch', l: lightness, c: hue === undefined ? 0 : profile.chroma, h: hue ?? 0
  }, 'oklch'))!;
  const backgroundFor = (color: string) => formatHex(interpolate([profile.backgrounds[0], color], 'rgb')(.08))!;
  // Check the final, quantized sRGB color, including its badge fill. A little
  // headroom avoids rounding below 4.5:1. OKLCH lightness alone is not contrast.
  const passes = (color: string) => [...profile.backgrounds, backgroundFor(color)]
    .every(background => wcagContrast(color, background) >= minimumContrast + .1);
  let foreground = colorAt(profile.lightness);
  if (!passes(foreground)) {
    let near = profile.lightness;
    let far = wcagLuminance(profile.backgrounds[0]) < .179 ? 1 : 0;
    for (let step = 0; step < 14; step++) {
      const middle = (near + far) / 2;
      if (passes(colorAt(middle))) far = middle;
      else near = middle;
    }
    foreground = colorAt(far);
  }
  const palette = {
    foreground,
    background: backgroundFor(foreground),
    onSolid: wcagContrast(foreground, '#000000') > wcagContrast(foreground, '#ffffff') ? '#000000' : '#ffffff'
  };
  colors.set(key, palette);
  return palette;
}

// Resolve custom properties through the browser so color-mix(), relative
// colors and light-dark() use the element's own theme, including shadow roots.
export function readColorVariables(element: HTMLElement, variables: string[]): string[] {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  element.append(probe);
  try {
    return variables.map(variable => {
      probe.style.color = `var(${variable})`;
      return formatHex(getComputedStyle(probe).color)!;
    });
  } finally { probe.remove(); }
}
