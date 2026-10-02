import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { repositoryRoot } from '../root.mjs';
import { gradePixels, validateGrade } from './color-workshop/grade.mjs';
import { splash2ColorAssets, splash2LogoAssets, splash2Encoding } from './splash2-artwork.mjs';

/** Produce reviewable PNG/WebP copies without rewriting sources or runtime artwork. */
export async function bakeSplash2({ config, output, sourceRoot = join(repositoryRoot, 'dev/assets/source/splash2/originals'), logoSourceRoot = join(repositoryRoot, 'dev/assets/source/logo') }) {
  const colors = Object.fromEntries([...new Set(splash2ColorAssets.map(([, layer]) => layer))].map(layer => [layer, validateGrade(config.color?.[layer])]));
  const directory = resolve(output);
  if (await access(directory).then(() => true, () => false)) throw new Error('Choose a fresh output directory; existing artwork is never overwritten.');
  // Prepare everything before creating the export so a missing source cannot
  // leave a partially graded set. Alpha is never processed by gradePixels.
  const prepared = [];
  const assets = [
    ...splash2ColorAssets.map(([name, layer]) => ({ name, layer, source: join(sourceRoot, `${name}.webp`) })),
    ...splash2LogoAssets.map(([name, layer, webpWidth]) => ({ name: `logo/${name}`, layer, source: join(logoSourceRoot, `${name}.webp`), webpWidth }))
  ];
  for (const { name, layer, source: sourcePath, webpWidth } of assets) {
    const source = await readFile(sourcePath);
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    gradePixels(data, colors[layer]);
    const png = await sharp(data, { raw: info }).png().toBuffer();
    const encoded = sharp(data, { raw: info });
    if (webpWidth) encoded.resize({ width: webpWidth, withoutEnlargement: true });
    const { data: webp, info: webpInfo } = await encoded.webp(splash2Encoding).toBuffer({ resolveWithObject: true });
    prepared.push({ name, layer, png, webp, width: info.width, height: info.height, webpWidth: webpInfo.width, webpHeight: webpInfo.height,
      sourceSha256: createHash('sha256').update(source).digest('hex') });
  }
  await mkdir(directory, { recursive: true });
  const manifest = { format: 'meat-proxy/splash2-color-bake', ...splash2Encoding, colors, assets: [] };
  for (const { name, layer, png, webp, width, height, webpWidth, webpHeight, sourceSha256 } of prepared) {
    await mkdir(dirname(join(directory, name)), { recursive: true });
    await writeFile(join(directory, `${name}.png`), png, { flag: 'wx' });
    await writeFile(join(directory, `${name}.webp`), webp, { flag: 'wx' });
    manifest.assets.push({ name, layer, width, height, webpWidth, webpHeight, sourceSha256, pngBytes: png.length, webpBytes: webp.length });
  }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  await writeFile(join(directory, 'settings.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [settingsPath, output] = process.argv.slice(2);
  if (!settingsPath || !output) throw new Error('Usage: node dev/tooling/splash/bake-splash2.mjs saved-splash2.json fresh-output-directory');
  const config = JSON.parse(await readFile(settingsPath, 'utf8'));
  const result = await bakeSplash2({ config, output });
  console.log(`Wrote ${result.assets.length} graded PNGs and WebPs to ${resolve(output)}. Runtime artwork is updated separately after review.`);
}
