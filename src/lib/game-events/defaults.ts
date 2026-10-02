import saved from '../../../config/studio.json';
import { gameEventContentSchema } from './schema';
import { migrateGameEventContent } from './migrate';

export const gameEventDefaults = gameEventContentSchema.parse(migrateGameEventContent(saved));
