import { digest } from './git';
import { createManifest } from '../review/manifest';
export const { manifest, patchKey } = createManifest(digest);
