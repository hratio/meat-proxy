import { z } from 'zod';

export const crosshairPatterns = ['default', 'system', 'classic', 'cross', 'dot', 'ring', 'ring-dot', 'brackets', 'chevron', 'diamond'] as const;
export const crosshairSize = { min: 12, max: 48, default: 25 };
export const crosshairSchema = z.object({
  pattern: z.enum(crosshairPatterns).default('default'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/).default('#f6ad7e'),
  sizePx: z.number().int().min(crosshairSize.min).max(crosshairSize.max).default(crosshairSize.default)
});
export type CrosshairConfig = z.infer<typeof crosshairSchema>;
export type CustomCrosshair = Exclude<CrosshairConfig['pattern'], 'default' | 'system'>;
export const defaultCrosshair = crosshairSchema.parse({});

const dot = '<circle cx="12.5" cy="12.5" r="1.5" fill="currentColor"/>';
export const customCrosshairs: { id: CustomCrosshair; label: string; shapes: string }[] = [
  { id: 'classic', label: 'Classic', shapes: '<path d="M12.5 1.5v4m0 14v4M1.5 12.5h4m14 0h4"/><circle cx="12.5" cy="12.5" r="6"/>' + dot },
  { id: 'cross', label: 'Cross', shapes: '<path d="M12.5 2.5v6m0 8v6M2.5 12.5h6m8 0h6"/>' },
  { id: 'dot', label: 'Dot', shapes: dot },
  { id: 'ring', label: 'Ring', shapes: '<circle cx="12.5" cy="12.5" r="6"/>' },
  { id: 'ring-dot', label: 'Ring & dot', shapes: '<circle cx="12.5" cy="12.5" r="7"/>' + dot },
  { id: 'brackets', label: 'Brackets', shapes: '<path d="M8.5 4.5h-4v4m12-4h4v4m0 8v4h-4m-8 0h-4v-4"/>' + dot },
  { id: 'chevron', label: 'Chevron', shapes: '<path d="m5.5 19.5 7-7 7 7"/>' },
  { id: 'diamond', label: 'Diamond', shapes: '<path d="m12.5 4.5 8 8-8 8-8-8Z"/>' + dot }
];

/** The same small SVG supplies the settings tile and the actual cursor. */
export function crosshairImage(pattern: CustomCrosshair, color: string, sizePx = crosshairSize.default): string {
  const shapes = customCrosshairs.find(item => item.id === pattern)!.shapes;
  const rgb = color.slice(0, 7);
  const opacity = color.length === 9 ? parseInt(color.slice(7), 16) / 255 : 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 25 25"><g opacity="${opacity}" fill="none" stroke-linecap="round" stroke-linejoin="round"><g color="#111111" stroke="#111111" stroke-width="3">${shapes}</g><g color="${rgb}" stroke="${rgb}" stroke-width="1">${shapes}</g></g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function crosshairCursor({ pattern, color, sizePx }: CrosshairConfig): string {
  if (pattern === 'default') return 'auto';
  if (pattern === 'system') return 'crosshair';
  const center = Math.floor(sizePx / 2);
  return `url("${crosshairImage(pattern, color, sizePx)}") ${center} ${center}, crosshair`;
}
