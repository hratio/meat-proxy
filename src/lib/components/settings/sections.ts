import { Monitor, Files, Crosshair, Volume2, Keyboard, Download } from '@lucide/svelte';
import type { SettingsGroup, SettingsPage } from './navigation';
import type { ExperienceMode } from '$lib/experience';

export const settingsGroups: (Omit<SettingsGroup, 'pages'> & { pages: (SettingsPage & { scope: 'game' | 'shared' })[] })[] = [
  { id: 'appearance', label: 'Appearance', icon: Monitor, pages: [
    { id: 'colors', scope: 'shared', label: 'Shell theme', description: '' },
    { id: 'background', scope: 'shared', label: 'Background', description: '' },
    { id: 'interface', scope: 'shared', label: 'Interface & motion', description: '' },
    { id: 'notifications', scope: 'shared', label: 'Notifications', description: '' },
    { id: 'hud', scope: 'game', label: 'HUD & navigator', description: '' }
  ] },
  { id: 'review', label: 'Review', icon: Files, pages: [
    { id: 'diffs', scope: 'shared', label: 'Diff appearance', description: '' },
    { id: 'files', scope: 'shared', label: 'File tree & sorting', description: '' },
    { id: 'editor', scope: 'shared', label: 'External editor', description: '' },
    { id: 'navigation', scope: 'shared', label: 'Scrolling & completion', description: '' }
  ] },
  { id: 'loadout', label: 'Loadout', icon: Crosshair, pages: [
    { id: 'weapons', scope: 'game', label: 'Weapons', description: '' },
    { id: 'crosshair', scope: 'game', label: 'Crosshair & targets', description: '' },
    { id: 'destruction', scope: 'game', label: 'Destruction', description: '' }
  ] },
  { id: 'audio', label: 'Audio', icon: Volume2, pages: [
    { id: 'sound', scope: 'game', label: 'Volume & voices', description: '' }
  ] },
  { id: 'input', label: 'Controls', icon: Keyboard, pages: [
    { id: 'controls', scope: 'shared', label: 'Key & mouse bindings', description: 'Click a binding, then press a key or mouse button. Esc cancels reassignment.' }
  ] },
  { id: 'data', label: 'Catalog & export', icon: Download, pages: [
    { id: 'catalog', scope: 'shared', label: 'Import V-codes', description: 'Import a JSON rule catalog. Existing findings keep their original rules.' },
    { id: 'export', scope: 'shared', label: 'Review exports', description: '' }
  ] }
];

export function settingsForMode(mode: ExperienceMode): SettingsGroup[] {
  return settingsGroups.map(group => ({ ...group, pages: group.pages.filter(page => mode === 'game' || page.scope === 'shared') }))
    .filter(group => group.pages.length);
}
