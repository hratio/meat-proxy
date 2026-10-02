import { z } from 'zod';
import { cannedResponseFieldsSchema, groupFieldsSchema, ruleFieldsSchema, weaponReferenceSchema, type Catalog } from './config';
import { destructionMarkSchema, resolveDestructionMark, destructionMarkRequired } from './destruction/completion';

const id = z.string().min(1).max(60);
export const catalogActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-destruction-mark'), mark: z.union([z.literal(''), destructionMarkSchema]) }),
  z.object({ type: z.literal('create-code'), groupId: id, fields: ruleFieldsSchema.omit({ active: true }).extend({
    bad: z.string().trim().min(1, 'Add a bad example.').max(10000),
    good: z.string().trim().min(1, 'Add a good example.').max(10000)
  }) }),
  z.object({ type: z.literal('update-code'), codeId: id, groupId: id.optional(), fields: ruleFieldsSchema.omit({ active: true }).partial().extend({ weapon: weaponReferenceSchema.nullable().optional() }) }),
  z.object({ type: z.literal('deactivate-code'), codeId: id }),
  z.object({ type: z.literal('create-response'), groupId: id, fields: cannedResponseFieldsSchema.omit({ active: true }) }),
  z.object({ type: z.literal('update-response'), responseId: id, groupId: id.optional(), fields: cannedResponseFieldsSchema.omit({ active: true }).partial() }),
  z.object({ type: z.literal('deactivate-response'), responseId: id }),
  z.object({ type: z.literal('create-group'), fields: groupFieldsSchema }),
  z.object({ type: z.literal('update-group'), groupId: id, fields: groupFieldsSchema })
]);

export type CatalogAction = z.infer<typeof catalogActionSchema>;
export type CatalogChange = { catalog: Catalog; codeId?: string; responseId?: string; groupId?: string };

// Only an explicit inactive flag hides a rule. Older imports and definitions
// retained in existing findings remain valid without a catalog migration.
export function activeCatalog(catalog: Catalog): Catalog {
  return { ...catalog, groups: catalog.groups.map(group => ({ ...group, codes: group.codes.filter(code => code.active !== false) })).filter(group => group.codes.length) };
}

export function inactiveCodes(catalog: Catalog) {
  return new Set(catalog.groups.flatMap(group => group.codes.filter(code => code.active === false).map(code => code.id)));
}

export function changeCatalog(catalog: Catalog, action: CatalogAction): CatalogChange {
  const next = structuredClone(catalog);
  if (action.type === 'set-destruction-mark') {
    if (action.mark && !resolveDestructionMark(next, action.mark)) throw new Error(destructionMarkRequired);
    next.destructionMark = action.mark;
    return { catalog: next };
  }
  if (action.type === 'create-group') {
    const base = action.fields.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'group';
    const used = new Set(next.groups.map(group => group.id));
    let groupId = base;
    for (let suffix = 2; used.has(groupId); suffix++) groupId = `${base}-${suffix}`;
    next.groups.push({ ...action.fields, id: groupId, codes: [], responses: [] });
    return { catalog: next, groupId };
  }
  if (action.type === 'create-response') {
    const group = next.groups.find(group => group.id === action.groupId);
    if (!group) throw new Error('That group no longer exists.');
    const last = Math.max(0, ...next.groups.flatMap(group => group.responses.map(response => Number(response.id.slice(1)))));
    if (last >= 999999) throw new Error('The canned response ID range is full.');
    const responseId = `C${String(last + 1).padStart(3, '0')}`;
    group.responses.push({ ...action.fields, id: responseId });
    return { catalog: next, responseId, groupId: group.id };
  }
  if (action.type === 'update-response' || action.type === 'deactivate-response') {
    const source = next.groups.find(group => group.responses.some(response => response.id === action.responseId));
    const response = source?.responses.find(response => response.id === action.responseId);
    if (!response) throw new Error('That canned response no longer exists.');
    if (action.type === 'deactivate-response') response.active = false;
    else {
      if (response.active === false) throw new Error('That canned response has been deleted.');
      const target = action.groupId ? next.groups.find(group => group.id === action.groupId) : source;
      if (!target) throw new Error('That group no longer exists.');
      Object.assign(response, action.fields);
      if (target !== source) {
        source!.responses = source!.responses.filter(item => item.id !== response.id);
        target.responses.push(response);
      }
      return { catalog: next, responseId: response.id, groupId: target.id };
    }
    return { catalog: next, groupId: source!.id };
  }
  if (action.type === 'create-code' || action.type === 'update-group') {
    const group = next.groups.find(group => group.id === action.groupId);
    if (!group) throw new Error('That group no longer exists.');
    if (action.type === 'update-group') {
      Object.assign(group, action.fields);
      // Missing weapon means inheriting the slot's configured model.
      group.weapon = action.fields.weapon;
    } else {
      const last = Math.max(0, ...next.groups.flatMap(group => group.codes.map(code => Number(code.id.slice(1)))));
      if (last >= 999999) throw new Error('The V-code ID range is full.');
      const codeId = `V${String(last + 1).padStart(3, '0')}`;
      group.codes.push({ ...action.fields, id: codeId });
      return { catalog: next, codeId, groupId: group.id };
    }
  } else {
    const source = next.groups.find(group => group.codes.some(code => code.id === action.codeId));
    const code = source?.codes.find(code => code.id === action.codeId);
    if (!code) throw new Error('That V-code no longer exists.');
    if (action.type === 'deactivate-code') code.active = false;
    else {
      if (code.active === false) throw new Error('That V-code has been deleted.');
      const target = action.groupId ? next.groups.find(group => group.id === action.groupId) : source;
      if (!target) throw new Error('That group no longer exists.');
      const { weapon, ...fields } = action.fields;
      Object.assign(code, fields);
      if (weapon !== undefined) code.weapon = weapon ?? undefined;
      if (target !== source) {
        source!.codes = source!.codes.filter(item => item.id !== code.id);
        target.codes.push(code);
      }
      return { catalog: next, codeId: code.id, groupId: target.id };
    }
  }
  return { catalog: next };
}
