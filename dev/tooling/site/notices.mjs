import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { repositoryRoot } from '../root.mjs';

const output = join(repositoryRoot, 'build-pages');
await mkdir(join(output, 'docs'), { recursive: true });
await cp(join(repositoryRoot, 'LICENSE'), join(output, 'LICENSE'));
await cp(join(repositoryRoot, 'docs/attribution.md'), join(output, 'docs/attribution.md'));
await cp(join(repositoryRoot, 'docs/licenses'), join(output, 'docs/licenses'), { recursive: true });
