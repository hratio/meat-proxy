import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { gradePixels, validateGrade } from './grade.mjs';

export const lutSize = 65;

export function generatePortraitLut(recipe) {
  const grade = validateGrade(recipe.adjustments);
  const samples = new Float32Array(lutSize ** 3 * 4);
  let offset = 0;
  // Red varies fastest, then green; blue slices stack vertically in the PNG.
  // Keep fractional input samples until grading to avoid quantizing the grid twice.
  for (let b = 0; b < lutSize; b++) for (let g = 0; g < lutSize; g++) for (let r = 0; r < lutSize; r++) {
    samples[offset++] = r * 255 / (lutSize - 1);
    samples[offset++] = g * 255 / (lutSize - 1);
    samples[offset++] = b * 255 / (lutSize - 1);
    samples[offset++] = 255;
  }
  return new Uint8Array(gradePixels(samples, grade));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const recipe = JSON.parse(await readFile(new URL('../../../assets/recipes/portrait/natural-grade.json', import.meta.url), 'utf8'));
  const pixels = generatePortraitLut(recipe);
  const png = await sharp(pixels, { raw: { width: lutSize, height: lutSize ** 2, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const output = new URL('../../../../src/lib/avatar/portrait-lut.png', import.meta.url);
  await writeFile(output, png);
  console.log(`Wrote ${fileURLToPath(output)} (${(png.length / 1024).toFixed(1)} KiB).`);
}
