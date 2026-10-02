import { enterRepository } from '../root.mjs';
enterRepository();
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const output = 'src/lib/components/hud/assets';
await mkdir(output, { recursive: true });

// Matching hardware surrounds use separate material and lamp color masks.
for (const [name, source, lamps] of [
  ['blade-runner-panel', 'blade-runner-panel', []],
  ['blade-runner-portrait', 'blade-runner-portrait', [[293, 213, 495, 15], [114, 392, 15, 422]]]
]) {
  const { data: pixels, info: size } = await sharp(`dev/assets/source/hud/${source}.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const neutral = Buffer.alloc(pixels.length), surface = Buffer.alloc(pixels.length, 255), accent = Buffer.alloc(pixels.length, 255);
  for (let i = 0; i < pixels.length; i += 4) {
    const value = Math.round(.2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]);
    const x = i / 4 % size.width, y = Math.floor(i / 4 / size.width);
    // The revised panel authors its two lamp channels in red; the older
    // portrait uses explicit bounds around its neutral lamp glass.
    const lamp = lamps.length ? lamps.some(([left, top, width, height]) => x >= left && x < left + width && y >= top && y < top + height)
      : pixels[i] - Math.max(pixels[i + 1], pixels[i + 2]) > 35;
    neutral[i] = neutral[i + 1] = neutral[i + 2] = value;
    neutral[i + 3] = pixels[i + 3];
    surface[i + 3] = lamp ? 0 : Math.round(pixels[i + 3] * Math.max(0, Math.min(1, (.85 - value / 255) / .5)));
    accent[i + 3] = lamp ? pixels[i + 3] : 0;
  }
  for (const [suffix, pixels] of [['', neutral], ['-tint-mask', surface], ['-accent-mask', accent]]) {
    await sharp(pixels, { raw: { width: size.width, height: size.height, channels: 4 } })
      .webp({ quality: 86, alphaQuality: 100 }).toFile(`${output}/${name}${suffix}.webp`);
  }
}
