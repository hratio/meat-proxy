import catalog from '../../config/catalog.v1.json';
import { catalogSchema } from './config';

export const defaultCatalog = catalogSchema.parse(catalog);
