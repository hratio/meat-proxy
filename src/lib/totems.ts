import artwork from './assets/totems/catalog.json';

// IDs belong to the artwork; array positions are persisted as catalog image
// indexes. Append new artwork to the manifest without reordering existing rows.
export const totems = artwork.map(({ id, name }, image) => ({ id, name, image }));

// The retired set had 50 entries. Wrap its last 20 selections into the new set,
// including rule snapshots retained by old findings and archived reviews.
export const totemIndex = (image: number) => image % totems.length;

export type TotemValue = number | string;

const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function isTotemCharacter(value: string): boolean {
  // Keep composed letters and joined emoji intact, but require a visible glyph.
  return /[^\p{Z}\p{C}\p{M}]/u.test(value) && !/[\p{Cc}\p{Cs}]/u.test(value)
    && characters.segment(value)[Symbol.iterator]().next().value?.segment === value;
}

export function firstTotemCharacter(value: string): string {
  const first = characters.segment(value)[Symbol.iterator]().next().value?.segment ?? '';
  return isTotemCharacter(first) ? first : '';
}
