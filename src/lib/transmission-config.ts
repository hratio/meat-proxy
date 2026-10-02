import { z } from 'zod';

export const transmissionSchema = z.object({
  enabled: z.boolean().default(true),
  movement: z.boolean().default(true),
  introSeconds: z.number().min(0).max(5).default(.55),
  outroSeconds: z.number().min(0).max(5).default(.85),
  widthPx: z.number().int().min(200).max(720).default(460),
  bottomPx: z.number().int().min(0).max(600).default(260),
  navigatorBottomPx: z.number().int().min(0).max(800).default(400)
});
export type TransmissionSettings = z.infer<typeof transmissionSchema>;
