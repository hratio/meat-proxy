export const targetArtworks = ['blade-runner', 'nuclear-reactor', 'rune'] as const;
export type TargetArtworkId = typeof targetArtworks[number];
export const defaultTargetArtwork: TargetArtworkId = 'blade-runner';
export const targetOptions = [
  { id: 'blade-runner', label: 'Blade Runner', description: 'Black metal cartridge' },
  { id: 'nuclear-reactor', label: 'Nuclear reactor', description: 'Triangular reactor' },
  { id: 'rune', label: 'Stone rune', description: 'Carved stone seal' }
] as const;
