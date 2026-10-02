import { enterRepository } from '../root.mjs';
enterRepository();
// Regenerate all three targets: 512px textures, masks and matching 3D contours.
// Run from the repository root: node dev/tooling/targets/prepare.mjs
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

import { traceArtworkContours } from './geometry.mjs';

const source = 'dev/assets/source/targets/rune-4.webp';
const hoverSource = 'dev/assets/source/targets/rune-4-hover.webp';
const directory = 'static/textures/targets';
await mkdir(directory, { recursive: true });
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data: hover, info: hoverInfo } = await sharp(hoverSource).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width, h = info.height;
if (hoverInfo.width !== w || hoverInfo.height !== h) throw Error('The hover mask source must match the original artwork dimensions.');
const neutral = Buffer.alloc(data.length), tint = Buffer.alloc(data.length), illumination = Buffer.alloc(data.length);
const smooth = (lo, hi, value) => {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
let tinted = 0, illuminated = 0, solidPixels = 0;
for (let i = 0; i < data.length; i += 4) {
  const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), chroma = hi - lo;
  const lightness = (hi + lo) / 2;
  const saturation = chroma / (1 - Math.abs(2 * lightness - 1) || 1);
  // Soft selection keeps gray stone / highlights neutral while the olive moss
  // and colored crevices take the theme. Chroma gating rejects noisy dark grays.
  const strength = smooth(.14, .55, saturation) * smooth(.025, .10, chroma);
  // The idle texture comes entirely from the original stone, preserving its
  // gray ring, carvings, highlights and shadows without artificial darkening.
  const luminance = Math.round((.2126 * r + .7152 * g + .0722 * b) * 255);
  neutral[i] = neutral[i + 1] = neutral[i + 2] = luminance;
  neutral[i + 3] = data[i + 3];
  tint[i] = tint[i + 1] = tint[i + 2] = 255;
  tint[i + 3] = Math.round(strength * data[i + 3]);
  // Only the light mask comes from the pink image. Keep its gradients and clip
  // it to the original stone alpha, including the transparent check opening.
  const hr = hover[i] / 255, hg = hover[i + 1] / 255, hb = hover[i + 2] / 255;
  const pink = smooth(.06, .24, hr - hg) * smooth(.025, .16, hb - hg);
  const light = .2126 * hr + .7152 * hg + .0722 * hb;
  illumination[i] = illumination[i + 1] = illumination[i + 2] = 255;
  illumination[i + 3] = Math.round(pink * Math.min(1, light / .65) * Math.min(data[i + 3], hover[i + 3]));
  if (pink > .5 && data[i + 3] >= 128) illuminated++;
  if (data[i + 3] >= 128) { solidPixels++; if (strength > .25) tinted++; }
}
if (illuminated < solidPixels * .05) throw Error('The pink illumination regions could not be found.');
for (const [name, pixels] of [['rune.webp', neutral], ['rune-tint-mask.webp', tint], ['rune-hover-mask.webp', illumination]]) {
  await sharp(pixels, { raw: { width: w, height: h, channels: 4 } })
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 40, alphaQuality: 100 }).toFile(`${directory}/${name}`);
}

const rune = { id: 'rune-4', image: '/textures/targets/rune.webp', tintMask: '/textures/targets/rune-tint-mask.webp', hoverMask: '/textures/targets/rune-hover-mask.webp', ...traceArtworkContours(data, w, h) };
await writeFile('src/lib/targets/rune.json', JSON.stringify(rune, null, 2) + '\n');
console.log(`Rune 4: 512×512 texture + tint / illumination masks; ${(tinted / solidPixels * 100).toFixed(1)}% colored detail, ${(illuminated / solidPixels * 100).toFixed(1)}% illuminated recesses; ${rune.outline.length} outer / ${rune.carving.length} inner edges.`);

{
const output = directory;
const smooth = (lo, hi, value) => {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

for (const [name, id] of [['blade-runner', 'blade-runner'], ['nuclear-reactor', 'nuclear-reactor']]) {
  const { data, info } = await sharp(`dev/assets/source/targets/${name}.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const base = Buffer.alloc(data.length), tint = Buffer.alloc(data.length), hover = Buffer.alloc(data.length);
  const nuclear = id === 'nuclear-reactor';
  let solid = 0, illuminated = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255, a = data[i + 3];
    const luminance = .2126 * r + .7152 * g + .0722 * b;
    // Vivid green tubes and amber strips identify the respective light masks.
    // Muted olive enamel, brass fittings and gray metal are not light sources.
    const lamp = nuclear ? smooth(.12, .5, (g - Math.max(r, b)) / Math.max(.05, g)) : smooth(.16, .44, r - b) * smooth(.09, .26, g - b);
    for (let channel = 0; channel < 3; channel++) {
      base[i + channel] = Math.round((nuclear ? data[i + channel] : luminance * 255) * (1 - lamp * .86));
    }
    base[i + 3] = a;
    // Nuclear enamel takes the theme while its brass and bare-metal details
    // retain their material. Blade Runner starts with neutral black metal.
    const material = nuclear ? smooth(.01, .07, g - b) * (1 - smooth(.01, .08, r - g)) : 1;
    tint[i] = tint[i + 1] = tint[i + 2] = 255;
    tint[i + 3] = Math.round(a * material * (1 - lamp) * (1 - smooth(.45, .85, luminance)));
    hover[i] = hover[i + 1] = hover[i + 2] = 255;
    const lampBrightness = Math.min(1, luminance / .6);
    hover[i + 3] = Math.round(a * lamp * (nuclear ? .65 + .35 * lampBrightness : lampBrightness));
    if (a >= 128) { solid++; if (lamp > .5) illuminated++; }
  }
  if (illuminated < solid * .008 || illuminated > solid * .3) throw Error(`${name}: illumination mask must select only the lamp channels.`);
  const layers = await Promise.all([base, tint, hover].map(pixels => sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 }
  }).resize(512, 512).raw().toBuffer()));
  // Clamp resampled masks to the final alpha, including the check aperture.
  for (const mask of layers.slice(1)) {
    for (let i = 3; i < mask.length; i += 4) mask[i] = Math.min(mask[i], layers[0][i]);
  }
  for (const [index, suffix] of ['', '-tint-mask', '-hover-mask'].entries()) {
    await sharp(layers[index], { raw: { width: 512, height: 512, channels: 4 } })
      .webp({ quality: 70, alphaQuality: 100 }).toFile(`${output}/${name}${suffix}.webp`);
  }
  const geometry = traceArtworkContours(data, info.width, info.height);
  await writeFile(`src/lib/targets/${name}.json`, JSON.stringify({ id, image: `/textures/targets/${name}.webp`, tintMask: `/textures/targets/${name}-tint-mask.webp`, hoverMask: `/textures/targets/${name}-hover-mask.webp`, ...geometry }, null, 2) + '\n');
  const checkWidth = Math.max(...geometry.carving.map(point => point[0])) - Math.min(...geometry.carving.map(point => point[0]));
  console.log(`${name}: ${(illuminated / solid * 100).toFixed(1)}% lamp coverage; ${checkWidth.toFixed(1)}% check width; ${geometry.outline.length} outer / ${geometry.carving.length} inner edges.`);
}
}
