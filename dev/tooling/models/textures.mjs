import assert from 'node:assert/strict';
import { readFile, readdir, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { readGLB } from './glb.mjs';

const sharedURI = /^\.\.\/textures\/[a-z0-9][a-z0-9-]*\.(webp|png|jpg)$/;

export function createTextureEncoder({ sources, originals, compression: { mode, quality } }) {
  assert(['lossless', 'near-lossless', 'lossy'].includes(mode), 'Texture mode must be lossless, near-lossless, or lossy');
  if (mode !== 'lossless') assert(Number.isInteger(quality) && quality >= 1 && quality <= 100, 'Texture quality must be an integer from 1 to 100');
  const encoded = new Map();
  return async ({ source, name = 'texture', mime, read }) => {
    let image;
    if (source) {
      assert.match(source, /^[a-z0-9][a-z0-9-]*\.(webp|png|jpg)$/, 'Original texture filename');
      if (encoded.has(source)) return encoded.get(source).result;
      image = await readFile(resolve(sources, source)).catch(error => {
        if (error.code !== 'ENOENT') throw error;
        throw new Error(`Missing original texture: ${resolve(sources, source)}. Check --sources or restore the private original; delivery textures are never reused as originals.`);
      });
    } else {
      image = await read();
      for (const entry of encoded.values()) if (entry.image.equals(image)) return entry.result;
      const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[mime];
      assert(ext, `Unsupported source texture type: ${mime}`);
      const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'texture';
      source = `${stem}.${ext}`;
      for (let suffix = 2; ; suffix++) {
        const path = resolve(sources, source);
        const previous = originals.get(path) ?? await readFile(path).catch(error => {
          if (error.code !== 'ENOENT') throw error;
        });
        if (!previous) { originals.set(path, image); break; }
        if (previous.equals(image)) break;
        source = `${stem}-${suffix}.${ext}`;
      }
      if (encoded.has(source)) return encoded.get(source).result;
    }
    const data = await sharp(image).webp({
      lossless: mode === 'lossless', nearLossless: mode === 'near-lossless',
      quality: mode === 'lossless' ? 100 : quality, alphaQuality: 100, effort: 5, exact: true,
    }).toBuffer();
    const tag = mode === 'lossless' ? mode : `${mode}-${quality}`;
    const result = { source, data, uri: `../textures/${source.replace(/\.[^.]+$/, '')}-${tag}.webp` };
    encoded.set(source, { image, result });
    return result;
  };
}

export function sharedTexturePaths(json, file) {
  return (json.images ?? []).filter(image => sharedURI.test(image.uri)).map(image => resolve(dirname(file), image.uri));
}

// Keep textures still referenced by another model.
export async function pruneTextures(output, candidates) {
  if (!candidates.size) return 0;
  const referenced = new Set();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(glb|gltf)$/.test(entry.name)) {
        const bytes = await readFile(path);
        const json = entry.name.endsWith('.glb') ? readGLB(bytes).json : JSON.parse(bytes);
        for (const image of json.images ?? []) if (image.uri) referenced.add(resolve(directory, image.uri));
      }
    }
  }
  await visit(output);
  let removed = 0;
  for (const path of candidates) if (!referenced.has(path)) {
    await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    removed++;
  }
  return removed;
}
