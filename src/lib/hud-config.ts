import { z } from 'zod';

// The lab and the game share these defaults; build overrides live in studio.json.
export const hudSchema = z.object({
  tintStrength: z.number().min(0).max(1).default(.3),
  alwaysShowCode: z.boolean().default(false),
  codeWordWrap: z.boolean().default(false),
  codePeekMs: z.number().int().min(0).max(15000).default(2000),
  weaponDelayMs: z.number().int().min(0).max(1500).default(200),
  width: z.number().int().min(600).max(1800).default(1200),
  bottom: z.number().int().min(0).max(80).default(0),
  leftWeight: z.number().min(0.5).max(2).default(1),
  rightWeight: z.number().min(0.5).max(2).default(1),
  centerWidth: z.number().int().min(160).max(320).default(218),
  codeHeight: z.number().int().min(70).max(320).default(142),
  portraitHeight: z.number().int().min(140).max(340).default(224),
  gap: z.number().int().min(0).max(28).default(2),
  codeSize: z.number().min(10).max(18).default(12),
  groupSize: z.number().min(14).max(28).default(20),
  titleSize: z.number().min(10).max(24).default(14),
  vcodeSize: z.number().min(20).max(48).default(34),
  iconSize: z.number().int().min(20).max(80).default(29),
  iconStyle: z.enum(['catalog', 'skull', 'shield', 'target']).default('catalog'),
  holsteredPeek: z.number().int().min(0).max(64).default(0),
  springStiffness: z.number().min(0.01).max(1).default(0.16),
  springDamping: z.number().min(0.1).max(1).default(0.46),
  navigatorEnabled: z.boolean().default(true),
  navigatorAlwaysVisible: z.boolean().default(false),
  navigatorNeighbors: z.number().int().min(1).max(5).default(3),
  navigatorWidthPx: z.number().int().min(200).max(640).default(500),
  navigatorMinWidthPx: z.number().int().min(180).max(360).default(220),
  navigatorRowHeightPx: z.number().int().min(32).max(64).default(40),
  navigatorGapPx: z.number().int().min(0).max(40).default(2),
  navigatorMotionMs: z.number().int().min(0).max(600).default(180),
  navigatorFarOpacity: z.number().min(0.2).max(1).default(0.55)
});

export type HudSettings = z.infer<typeof hudSchema>;

// Carry forward customized values from the previous flat-card HUD. Old generated
// defaults should not override the new frame's proportions. Explicit [hud] wins.
export function migrateHudSettings<T extends Record<string, unknown>>(input: T): T {
  const result = structuredClone(input);
  const priorHud = result.hud as Record<string, unknown> | undefined;
  if (priorHud) for (const key of ['accent', 'metal', 'wear', 'bevel', 'segments', 'progressBlockHeight']) delete priorHud[key];
  const display = result.display as Record<string, unknown> | undefined;
  if (!display) return result;
  const hud = { ...result.hud as Record<string, unknown> | undefined };
  const mapped = {
    hudWidthPx: ['width', 1080], hudBottomPx: ['bottom', 16],
    hudFontSize: ['titleSize', 16], hudCodeSize: ['vcodeSize', 32],
    hudImageSize: ['iconSize', 72]
  } as const;
  for (const [old, [key, previousDefault]] of Object.entries(mapped)) {
    if (display[old] !== undefined && display[old] !== previousDefault && hud[key] === undefined) {
      const field = hudSchema.shape[key].removeDefault();
      const value = Number(display[old]);
      hud[key] = Math.max(field.minValue!, Math.min(field.maxValue!, value));
    }
  }
  for (const key of Object.keys(display)) if (key.startsWith('hud') || key === 'holsteredPeekPx') delete display[key];
  if (Object.keys(hud).length) Object.assign(result, { hud });
  return result;
}
