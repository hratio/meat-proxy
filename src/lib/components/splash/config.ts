import { z } from 'zod';
import { landscapeSchema } from './landscape-config';
export * from './playback-config';

/** The landscape editor cannot modify the artwork's independently saved recipe. */
export const splashConfigSchema = z.strictObject({ landscape: landscapeSchema });
