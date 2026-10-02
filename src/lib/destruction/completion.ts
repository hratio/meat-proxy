import type { Catalog } from '../config';
import { z } from 'zod';

export const destructionMarkSchema = z.string().regex(/^[VC]\d{3,6}$/, 'Choose a V-code or canned response.');

/** Resolve against the live catalog: deleted and inactive choices cannot arm files. */
export function resolveDestructionMark(catalog: Catalog | undefined, id = catalog?.destructionMark || '') {
  if (!id || !catalog) return;
  for (const group of catalog.groups) {
    const rule = group.codes.find(rule => rule.id === id && rule.active !== false);
    if (rule) return { kind: 'code' as const, rule };
    const response = group.responses.find(response => response.id === id && response.active !== false);
    if (response) return { kind: 'response' as const, response };
  }
}

/** Preserve selections made before the completion mark belonged to the catalog. */
export function migrateDestructionMark(catalog: Catalog, settings: unknown, hasSavedCatalog = true): Catalog {
  if ((hasSavedCatalog && catalog.destructionMark !== undefined) || !settings || typeof settings !== 'object' || !('destruction' in settings)) return catalog;
  const previous = settings.destruction;
  if (!previous || typeof previous !== 'object' || !('completionMark' in previous)) return catalog;
  const mark = previous.completionMark;
  return mark === '' || destructionMarkSchema.safeParse(mark).success ? { ...catalog, destructionMark: mark as string } : catalog;
}

export const destructionMarkRequired = 'Choose a V-code or canned response in Rules and enable Use for destruction.';
