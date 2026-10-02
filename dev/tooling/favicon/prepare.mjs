import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = new URL('../../../', import.meta.url);
const source = new URL('dev/assets/source/favicon/dude-ruby-closeup.webp', root);
// Desktop tabs/bookmarks, including high-DPI displays. A 256 px entry used to
// account for almost the entire ICO download; there is no home-screen icon.
const sizes = [16, 32, 48, 64];
const images = await Promise.all(sizes.map(async size => {
  // Decode the complete master before resizing, as with the original PNG input.
  const resized = sharp(source.pathname).resize(size, size, { kernel: 'lanczos3', fastShrinkOnLoad: false });
  const rgba = await resized.clone().png({ compressionLevel: 9 }).toBuffer();
  const palette = await resized.clone().png({ compressionLevel: 9, palette: true,
    quality: 100, colours: 256, effort: 10, dither: .5 }).toBuffer();
  // Palette encoding helps the larger entries, while truecolor is smaller at
  // 16 px. Both retain transparency and strip source metadata.
  return palette.length < rgba.length ? palette : rgba;
}));

await writeFile(new URL('static/favicon.png', root), images.at(-1));

// Each ICO entry contains its own PNG, preserving alpha at native tab sizes.
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  header[entry] = header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await writeFile(new URL('static/favicon.ico', root), Buffer.concat([header, ...images]));
console.log(`Prepared ${images.at(-1).length} byte PNG and ${offset} byte ICO (${sizes.join(', ')} px).`);
