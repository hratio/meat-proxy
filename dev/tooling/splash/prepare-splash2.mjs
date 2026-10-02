import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import { enterRepository } from '../root.mjs';
import { splash2Encoding } from './splash2-artwork.mjs';

enterRepository();
if (!process.argv[2]) throw new Error('Usage: node dev/tooling/splash/prepare-splash2.mjs /path/to/SPLASH2');
const source = resolve(process.argv[2]);
const output = 'src/lib/components/splash/assets/splash2';
const references = 'dev/assets/source/splash2';
const originals = `${references}/originals`;
const inputs = [
  ['back1.png', 'background'],
  ['back2/pylonleft.png', 'pylon-left'],
  ['back2/pylonright.png', 'pylon-right'],
  ['back2/firstring.png', 'first-ring'],
  ['back2/secondring.png', 'second-ring'],
  ['title/mainframe.png', 'main-frame'],
  ['title/meatproxy.png', 'meat-proxy'],
  ['title/TEXT_ONLY_SUBTITLE.png', 'subtitle-text'],
  ['LGTM.png', 'lgtm'],
  ['back2/FULL EXAMPLE POSITION.png', 'back2-reference', references]
];
// The suffixes are the artist's version numbers, independent of filesystem order.
const portraits = await readdir(join(source, 'dude'));
for (const version of [1, 2]) {
  const matches = portraits.filter(name => new RegExp(`-${version}\\.png$`, 'i').test(name));
  if (matches.length !== 1) throw new Error(`Expected one dude PNG ending in -${version}.png.`);
  inputs.push([`dude/${matches[0]}`, `dude-${version}`]);
}
await mkdir(output, { recursive: true });
await mkdir(references, { recursive: true });
await mkdir(originals, { recursive: true });
const manifest = { ...splash2Encoding, assets: [] };
for (const [input, name, directory = output] of inputs) {
  const destination = `${directory}/${name}.webp`;
  // Preserve every RGBA pixel, including hidden RGB, for previews and repeatable bakes.
  if (directory === output) await sharp(join(source, input)).webp({ lossless: true, exact: true, effort: 6 }).toFile(`${originals}/${name}.webp`);
  const info = await sharp(join(source, input)).webp(splash2Encoding).toFile(destination);
  const master = directory === output ? `${originals}/${name}.webp` : destination;
  manifest.assets.push({ source: directory === output ? `originals/${name}.webp` : `${name}.webp`, output: destination, width: info.width, height: info.height, bytes: info.size,
    sourceSha256: createHash('sha256').update(await readFile(master)).digest('hex') });
}
await writeFile(`${references}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${manifest.assets.length} Splash 2 WebPs at quality 60 (${Math.round(manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0) / 1024)} KiB).`);
