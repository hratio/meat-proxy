import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = new URL('../../../static/textures/weapons/', import.meta.url);
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 6832, strictPort: true, watch: null, hmr: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:6832/');
  await mkdir(output, { recursive: true });
  for (const size of [32, 64, 128, 256, 512]) {
    const url = await page.evaluate(async size => {
      const { paintWeaponTexture, weaponTextureNames } = await import('/src/lib/weapons/texture-art.ts');
      const atlas = document.createElement('canvas'); atlas.width = atlas.height = size * 3;
      const target = atlas.getContext('2d');
      for (const [index, name] of weaponTextureNames.entries()) {
        const tile = document.createElement('canvas'); tile.width = tile.height = size;
        paintWeaponTexture(name, tile.getContext('2d'), size);
        target.drawImage(tile, index % 3 * size, Math.floor(index / 3) * size);
      }
      return atlas.toDataURL('image/png');
    }, size);
    await writeFile(new URL(`effects-${size}.webp`, output), await sharp(Buffer.from(url.split(',')[1], 'base64')).webp({ quality: 40, alphaQuality: 100 }).toBuffer());
  }
  console.log('Baked effect atlases at five resolutions.');
} finally { await browser?.close(); await server.close(); }
