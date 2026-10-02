import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
export function enterRepository() { process.chdir(repositoryRoot); }
