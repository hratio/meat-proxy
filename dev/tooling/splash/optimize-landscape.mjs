import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, prune, weld, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { bakeWaterfrontDisplay } from './bake-waterfront-display.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule()
});
for (const filename of ['waterfront.glb', 'driving-set.glb']) {
  const path = process.argv[2] ? resolve(process.argv[2], filename) : fileURLToPath(new URL(`../../../static/scenery/${filename}`, import.meta.url));
  const source = await readFile(path).catch(error => {
    if (process.argv[2] && filename === 'driving-set.glb' && error.code === 'ENOENT') return null;
    throw error;
  });
  if (!source) continue;
  const document = await io.readBinary(source), waterfront = filename === 'waterfront.glb';
  const version = waterfront ? 2 : 1;
  if (document.getRoot().getExtras().waterfrontCompression === version) {
    console.log(`${filename} is already compressed.`);
    continue;
  }
  for (const node of document.getRoot().listNodes()) {
    if (node.getExtras().waterfront_part) node.setName(node.getExtras().waterfront_part);
  }
  if (waterfront) {
    const baked = await bakeWaterfrontDisplay(document);
    if (baked) console.log(`Crown display: ${baked.omittedTriangles} hidden glyph triangles → ${baked.bytes} byte lossless mask`);
    for (const node of document.getRoot().listNodes()) {
      if (!['AlpineMassif', 'AlpineMassifDistant'].includes(node.getName())) continue;
      // The mountain shader derives all shading from positions and normals.
      for (const primitive of node.getMesh().listPrimitives()) {
        primitive.setAttribute('TEXCOORD_0', null); primitive.setAttribute('COLOR_0', null);
      }
    }
    // UV0 is surface-role data and UV1 is sign flow. They are used by custom
    // shaders even without a standard glTF texture, so pruning must retain them.
    await document.transform(weld(), prune({ keepLeaves: true, keepAttributes: true }));
    for (const name of ['CrownGate', 'OrbitalObservatory', 'TwistingSpire']) {
      const node = document.getRoot().listNodes().find(node => node.getName() === name);
      assert(node, `Missing runtime landmark: ${name}`);
      for (const primitive of node.getMesh().listPrimitives()) {
        for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0', ...(name === 'TwistingSpire' ? [] : ['TEXCOORD_1'])]) {
          assert(primitive.getAttribute(semantic), `${name} lost ${semantic}`);
        }
      }
    }
  }
  await document.transform(draco({ encodeSpeed: 0, decodeSpeed: 5,
    quantizePosition: waterfront ? 15 : 16, quantizeNormal: waterfront ? 10 : 12,
    quantizeTexcoord: 16, quantizeColor: 12, quantizeGeneric: 16 }));
  // Runtime display masks are already compressed losslessly at their exact
  // 2048×128 resolution. Never send them through the general 256 px WebP pass.
  if (!waterfront && document.getRoot().listTextures().length) {
    await document.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], quality: 85 }));
  }
  document.getRoot().setExtras({ ...document.getRoot().getExtras(), waterfrontCompression: version });
  const bytes = await io.writeBinary(document);
  if (bytes.length >= source.length) throw new Error(`Compressed ${filename} unexpectedly grew.`);
  await writeFile(path, bytes);
  console.log(`${filename}: ${source.length.toLocaleString()} → ${bytes.length.toLocaleString()} bytes`);
}
