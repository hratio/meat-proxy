import type { Catalog } from './config';

export function cannedResponseGroups(catalog: Catalog) {
  return catalog.groups.map(group => ({ ...group, responses: (group.responses || []).filter(response => response.active !== false) }))
    .filter(group => group.responses.length);
}

export function appendCannedResponse(draft: string, content: string) {
  const text = draft.trim() ? `${draft.trimEnd()}\n\n${content}` : content;
  if (text.length > 20000) throw new Error('This response would make the comment longer than 20,000 characters. Shorten the draft before inserting it.');
  return text;
}
