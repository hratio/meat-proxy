import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { npm, root } from './package.mjs';

const directory = join(root, 'tmp/npm-bootstrap');
const source = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'package.json'), `${JSON.stringify({
  name: source.name,
  version: '0.0.0-bootstrap.0',
  description: 'Bootstrap shell for Meat Proxy trusted publishing. Not the application.',
  license: source.license,
  repository: source.repository,
  files: ['README.md', 'LICENSE'],
  publishConfig: source.publishConfig
}, null, 2)}\n`);
await writeFile(join(directory, 'README.md'), '# Meat Proxy\n\nThis is a bootstrap shell for configuring npm trusted publishing.\nThe application will be released separately from GitHub Actions.\n');
await copyFile(join(root, 'LICENSE'), join(directory, 'LICENSE'));
const [pack] = JSON.parse(npm(['pack', directory, '--ignore-scripts', '--json', '--pack-destination', directory]));
console.log(`Prepared ${join(directory, pack.filename)} (${pack.files.map(file => file.path).join(', ')}). Nothing has been uploaded.`);
