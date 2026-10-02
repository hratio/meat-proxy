// Edit these settings, then run npm run models:optimize.
const TEXTURE_COMPRESSION = {
  mode: 'lossy', // 'lossless', 'near-lossless', or 'lossy'
  quality: 55,
};

import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Format, PropertyType } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, draco } from '@gltf-transform/functions';
import { createModelIO } from './io.mjs';
import { readGLB, writeGLB } from './glb.mjs';
import { createTextureEncoder, pruneTextures, sharedTexturePaths } from './textures.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const geometryVersion = 1;

export async function optimizeModels({
  input = resolve(root, 'static/models'), output = input,
  sources = process.env.MEAT_PROXY_MODEL_SOURCES,
  compression = TEXTURE_COMPRESSION, quiet = false,
} = {}) {
  assert(sources, 'Pass --sources /path/to/private/textures or set MEAT_PROXY_MODEL_SOURCES. Original textures belong outside the public repository.');
  input = resolve(input); output = resolve(output); sources = resolve(sources);
  assert(sources !== resolve(root) && !sources.startsWith(resolve(root) + sep), 'Keep original textures outside the public repository');
  assert(sources !== output && !sources.startsWith(output + sep), 'Keep source textures outside the delivery directory');
  const manifest = JSON.parse(await readFile(resolve(input, 'weapons/manifest.json'), 'utf8'));
  // The glove is a finished delivery asset. Only weapons retain editable sources.
  const files = manifest.weapons.map(asset => `weapons/${asset.id}.glb`);
  const staged = new Map(), originals = new Map(), previousTextures = new Set(), records = [];
  const encode = createTextureEncoder({ sources, originals, compression });
  let io;

  for (const file of files) {
    const source = await readFile(resolve(input, file));
    const original = readGLB(source).json;
    let { json, binary } = readGLB(source);
    const previous = await readFile(resolve(output, file)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (previous) for (const path of sharedTexturePaths(readGLB(previous).json, resolve(output, file))) previousTextures.add(path);

    if (original.asset.extras?.meatProxyOptimization?.version !== geometryVersion) {
      // Compress geometry once per Blender export.
      io ??= await createModelIO(true);
      const document = await io.read(resolve(input, file));
      const before = statistics(document);
      await document.transform(dedup({ propertyTypes: [PropertyType.TEXTURE] }));
      await document.transform(draco({
        quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 16, quantizeGeneric: 16
      }));
      for (const texture of document.getRoot().listTextures()) {
        const result = await encode({
          source: texture.getExtras().meatProxyTextureSource,
          name: texture.getName(),
          mime: texture.getMimeType(), read: async () => Buffer.from(texture.getImage()),
        });
        texture.setImage(result.data).setMimeType('image/webp').setURI(result.uri);
        texture.setExtras({ ...texture.getExtras(), meatProxyTextureSource: result.source });
        document.createExtension(EXTTextureWebP).setRequired(true);
      }
      const result = await io.writeJSON(document, { format: Format.GLTF, basename: file.split('/').pop().slice(0, -4) });
      json = result.json;
      const after = statistics(await io.readJSON(result));
      assert.equal(after.triangles, before.triangles - before.degenerate, `Only zero-area faces may disappear: ${file}`);
      // Restore exact authored near-identity transforms omitted by the writer.
      for (const [i, node] of json.nodes.entries()) for (const [field, identity] of Object.entries({
        translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1]
      })) {
        const value = original.nodes[i][field];
        if (value && !node[field]) {
          assert(value.every((v, j) => Math.abs(v - identity[j]) < 1e-6), `Unexpected transform omission: ${node.name}`);
          node[field] = value;
        }
      }
      assert.deepEqual(json.nodes, original.nodes, `Transforms, skeleton, sockets and animation pivots: ${file}`);
      assert.equal(json.buffers.length, 1, 'One embedded geometry buffer');
      binary = Buffer.from(result.resources[json.buffers[0].uri]);
      delete json.buffers[0].uri;
      json.asset.extras = { ...json.asset.extras, meatProxyOptimization: { version: geometryVersion } };
      for (const image of json.images ?? []) staged.set(resolve(output, dirname(file), image.uri), Buffer.from(result.resources[image.uri]));
    } else {
      for (const image of json.images ?? []) {
        assert.match(image.uri, /^\.\.\/textures\/[a-z0-9][a-z0-9-]*\.(webp|png|jpg)$/);
        const result = await encode({
          source: image.extras?.meatProxyTextureSource,
          mime: image.mimeType, read: () => readFile(resolve(input, dirname(file), image.uri)),
        });
        image.uri = result.uri;
        image.mimeType = 'image/webp';
        image.extras = { ...image.extras, meatProxyTextureSource: result.source };
        staged.set(resolve(output, dirname(file), image.uri), result.data);
      }
    }

    // All delivery textures are WebP, including models previously using JPEG.
    for (const texture of json.textures ?? []) {
      const source = texture.extensions?.EXT_texture_webp?.source ?? texture.source;
      assert.equal(json.images[source]?.mimeType, 'image/webp', 'Texture has a WebP image');
      texture.extensions = { ...texture.extensions, EXT_texture_webp: { source } };
      delete texture.source;
    }
    if (json.textures?.length) for (const field of ['extensionsUsed', 'extensionsRequired']) {
      json[field] = [...new Set([...(json[field] ?? []), 'EXT_texture_webp'])];
    }
    const bytes = writeGLB(json, binary);
    staged.set(resolve(output, file), bytes);
    const textures = [...new Set((json.images ?? []).map(image => image.uri))].map(uri => ({
      url: `/models/${relative(output, resolve(output, dirname(file), uri)).split(sep).join('/')}`,
      bytes: staged.get(resolve(output, dirname(file), uri)).length
    }));
    const record = {
      bytes: bytes.length,
      downloadBytes: bytes.length + textures.reduce((sum, image) => sum + image.bytes, 0),
      textures,
      triangles: json.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((sum, primitive) => sum + json.accessors[primitive.indices].count / 3, 0), 0),
      vertices: json.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((sum, primitive) => sum + json.accessors[primitive.attributes.POSITION].count, 0), 0)
    };
    records.push({ file, ...record });
    Object.assign(manifest.weapons.find(asset => file === `weapons/${asset.id}.glb`), record);
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  staged.set(resolve(output, 'weapons/manifest.json'), manifestBytes);
  if (output === resolve(root, 'static/models')) staged.set(resolve(root, 'src/lib/weapons/manifest.json'), manifestBytes);

  // Preserve originals before replacing any delivery files. Never overwrite a
  // master with a subsequent compressed output, even if a run is interrupted.
  for (const [path, data] of originals) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx' }).catch(async error => {
      if (error.code !== 'EEXIST') throw error;
      assert((await readFile(path)).equals(data), `Source texture changed: ${path}`);
    });
  }
  for (const [path, data] of staged) {
    await mkdir(dirname(path), { recursive: true });
    const previous = await readFile(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (!previous?.equals(data)) await writeFile(path, data);
  }
  const removed = await pruneTextures(output, previousTextures);
  const modelBytes = records.reduce((sum, asset) => sum + asset.bytes, 0);
  const textureBytes = [...staged].filter(([path]) => dirname(path) === resolve(output, 'textures')).reduce((sum, [, data]) => sum + data.length, 0);
  if (!quiet) {
    console.table(records.map(asset => ({ asset: asset.file.split('/').pop(), glbKB: Math.round(asset.bytes / 1000), coldMB: (asset.downloadBytes / 1e6).toFixed(2) })));
    console.log(`Rebuilt WebP textures: ${compression.mode}${compression.mode === 'lossless' ? '' : `, quality ${compression.quality}`}. Models + unique textures: ${((modelBytes + textureBytes) / 1e6).toFixed(2)} MB.`);
    console.log(`Originals: ${relative(root, sources)}. Removed ${removed} superseded textures. Existing geometry is unchanged.`);
  }
  return { records, modelBytes, textureBytes, removed };
}

function statistics(document) {
  let triangles = 0, degenerate = 0;
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const positions = primitive.getAttribute('POSITION'), indices = primitive.getIndices();
    triangles += indices.getCount() / 3;
    for (let i = 0; i < indices.getCount(); i += 3) {
      const [a, b, c] = [0, 1, 2].map(j => positions.getElement(indices.getScalar(i + j), []));
      const u = b.map((x, j) => x - a[j]), v = c.map((x, j) => x - a[j]);
      if (u[1] * v[2] === u[2] * v[1] && u[2] * v[0] === u[0] * v[2] && u[0] * v[1] === u[1] * v[0]) degenerate++;
    }
  }
  return { triangles, degenerate };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    assert(['--input', '--output', '--sources'].includes(args[i]), `Unknown option: ${args[i]}`);
    assert(args[i + 1] && !args[i + 1].startsWith('--'), `${args[i]} needs a directory`);
    options[args[i].slice(2)] = resolve(args[i + 1]);
  }
  await optimizeModels(options);
}
