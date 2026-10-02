import { enterRepository } from '../root.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

enterRepository();
const { weapons } = JSON.parse(await readFile('src/lib/weapons/manifest.json', 'utf8'));
await mkdir('static/armory', { recursive: true });
for (const { id } of weapons) {
  await sharp(`dev/assets/source/armory/${id}.webp`)
    .webp({ quality: 40, alphaQuality: 100 })
    .toFile(`static/armory/${id}.webp`);
}
console.log(`Prepared ${weapons.length} armory thumbnails as WebP quality 40.`);
