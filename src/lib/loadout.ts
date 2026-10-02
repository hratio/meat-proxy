import type { Catalog } from './config';

export const loadoutStorageKey = 'meat-proxy:loadout:v1';
export type LoadoutSlot = { group: string; code: string; drawn: boolean };
export type Loadout = { primary: LoadoutSlot; secondary: LoadoutSlot };

export function readLoadout(value: string | null): Loadout | undefined {
  try {
    const parsed = JSON.parse(value || 'null');
    const valid = (slot: unknown): slot is LoadoutSlot => !!slot && typeof slot === 'object'
      && 'group' in slot && typeof slot.group === 'string' && 'code' in slot && typeof slot.code === 'string'
      && 'drawn' in slot && typeof slot.drawn === 'boolean';
    return valid(parsed?.primary) && valid(parsed?.secondary) ? parsed : undefined;
  } catch { return; }
}

export function restoreSlot(slot: LoadoutSlot | undefined, groups: Catalog['groups'], fallbackGroup: number, drawn: boolean) {
  // IDs survive reordering and codes moving between groups. Removed/inactive
  // choices fall back to a usable group without affecting the other weapon.
  let group = slot ? groups.findIndex(group => group.codes.some(code => code.id === slot.code)) : -1;
  if (group < 0 && slot) group = groups.findIndex(group => group.id === slot.group);
  if (group < 0) group = Math.max(0, Math.min(fallbackGroup, groups.length - 1));
  const code = Math.max(0, groups[group]?.codes.findIndex(code => code.id === slot?.code) ?? 0);
  return { group, code, drawn: slot?.drawn ?? drawn };
}
