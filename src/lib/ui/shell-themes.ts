export const shellThemeIds = ['bunker', 'slate', 'ember', 'oxide', 'midnight'] as const;
export type ShellTheme = typeof shellThemeIds[number];
export const defaultShellTheme: ShellTheme = 'bunker';

export const shellThemes = [
  { id: 'bunker', name: 'Bunker' },
  { id: 'slate', name: 'Slate' },
  { id: 'ember', name: 'Ember' },
  { id: 'oxide', name: 'Oxide' },
  { id: 'midnight', name: 'Midnight' }
] as const satisfies readonly { id: ShellTheme; name: string }[];

export function isShellTheme(value: unknown): value is ShellTheme {
  return typeof value === 'string' && shellThemeIds.includes(value as ShellTheme);
}
