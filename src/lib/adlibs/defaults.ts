import saved from '../../../config/studio.json';
import { adlibSchema } from './schema';

// Authored build content, separate from user preferences and their config API.
export const adlibDefaults = adlibSchema.parse((saved as { adlibs?: unknown }).adlibs ?? {});
