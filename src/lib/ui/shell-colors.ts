import { wcagContrast } from 'culori';

export type ShellColors = { customColors?: boolean; baseTint?: string; accent?: string };
export const shellColorProperties = ['--shell-tint', '--shell-accent', '--shell-on-accent'] as const;
const hex = (value?: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;

export function shellColorVariables(colors: ShellColors): Record<string, string> {
  if (!colors.customColors) return {};
  const tint = hex(colors.baseTint), accent = hex(colors.accent);
  return {
    ...(tint ? { '--shell-tint': tint } : {}),
    ...(accent ? {
      '--shell-accent': accent,
      '--shell-on-accent': wcagContrast(accent, '#000000') > wcagContrast(accent, '#ffffff') ? '#000000' : '#ffffff'
    } : {})
  };
}

// Only validated hex colors reach the initial HTML's style attribute.
export function shellColorStyle(colors: ShellColors) {
  return Object.entries(shellColorVariables(colors)).map(([key, value]) => `${key}:${value}`).join(';');
}
