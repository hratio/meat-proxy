import type { BackgroundConfig } from './config';

export function backgroundName(filename: string) {
  return filename.replace(/\.[^.]+$/, '')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^./, letter => letter.toUpperCase());
}

// Vite discovers and packages these files for both local and static builds.
const assets = import.meta.glob<string>('./assets/*.{svg,png,jpg,jpeg,webp,avif,gif}', { eager: true, query: '?url', import: 'default' });
export const backgrounds = Object.entries(assets).map(([path, url]) => {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  return { value: filename, label: backgroundName(filename), url };
}).sort((a, b) => a.label.localeCompare(b.label));

export const backgroundSizing = [
  { value: 'cover', label: 'Cover', description: 'Fill the screen, cropping the edges when needed.' },
  { value: 'contain', label: 'Fit', description: 'Show the whole image while preserving its proportions.' },
  { value: 'stretch', label: 'Stretch', description: 'Fill the screen by stretching the image in both directions.' },
  { value: 'tile', label: 'Tile', description: 'Repeat the image at its original size.' },
  { value: 'center', label: 'Center', description: 'Center the image at its original size without repeating.' }
] satisfies { value: BackgroundConfig['sizing']; label: string; description: string }[];

export function backgroundVariables(background: BackgroundConfig): Record<string, string> {
  const image = background.mode === 'image' ? backgrounds.find(item => item.value === background.image) : undefined;
  return {
    '--arena-background-color': background.mode === 'color' ? background.color : 'var(--background)',
    '--arena-background-image': image ? `url(${JSON.stringify(image.url)})` : 'none',
    '--arena-background-opacity': String(background.opacity),
    '--arena-background-size': background.sizing === 'stretch' ? '100% 100%' : ['tile', 'center'].includes(background.sizing) ? 'auto' : background.sizing,
    '--arena-background-repeat': background.sizing === 'tile' ? 'repeat' : 'no-repeat',
    '--arena-background-position': background.sizing === 'tile' ? '0 0' : 'center'
  };
}
