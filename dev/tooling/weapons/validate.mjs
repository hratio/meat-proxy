import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createModelIO } from '../models/io.mjs';

const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--directory'), 'Usage: validate.mjs [--directory weapons-directory]');
const directory = args.length ? pathToFileURL(resolve(args[1]) + sep) : new URL('../../../static/models/weapons/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
if (!args.length) assert.deepEqual(JSON.parse(await readFile(new URL('../../../src/lib/weapons/manifest.json', import.meta.url), 'utf8')), manifest, 'App catalog matches the downloadable manifest');
assert(manifest.weapons.length > 0, 'The arsenal is not empty');
assert.equal(new Set(manifest.weapons.map(asset => asset.id)).size, manifest.weapons.length);
assert.deepEqual(manifest.weapons.map(asset => asset.weaponId).sort((a, b) => a - b), Array.from({ length: manifest.weapons.length }, (_, i) => i + 1), 'Public IDs are unique and append-only');
const io = await createModelIO();
const sharedTextures = new Map();
let totalBytes = 0;
for (const asset of manifest.weapons) {
  const bytes = await readFile(new URL(`${asset.id}.glb`, directory));
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(data.getUint32(0, true), 0x46546c67, 'GLB magic');
  assert.equal(data.getUint32(4, true), 2, 'glTF 2');
  assert.equal(data.getUint32(8, true), bytes.length, 'GLB length');
  const jsonLength = data.getUint32(12, true);
  assert.equal(data.getUint32(16, true), 0x4e4f534a, 'JSON chunk');
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  assert.equal(data.getUint32(24 + jsonLength, true), 0x004e4942, 'BIN chunk');
  assert.equal(asset.bytes, bytes.length, 'Manifest size matches exported bytes');
  assert(gltf.buffers.every(buffer => !buffer.uri), 'No external buffer dependencies');
  let textureBytes = 0;
  const textureURIs = new Set();
  for (const image of gltf.images ?? []) {
    assert.match(image.uri, /^\.\.\/textures\/[a-z0-9][a-z0-9-]*\.(webp|png|jpg)$/, 'Shared local texture');
    const texture = await readFile(new URL(image.uri, directory));
    if (!textureURIs.has(image.uri)) textureBytes += texture.length;
    textureURIs.add(image.uri); sharedTextures.set(image.uri, texture.length);
  }
  assert.equal(asset.downloadBytes, bytes.length + textureBytes, 'Cold download includes all textures');
  assert.equal(asset.textures.reduce((sum, image) => sum + image.bytes, 0), textureBytes, 'Texture metadata matches resources');
  assert((gltf.extensionsRequired ?? []).every(name => ['KHR_draco_mesh_compression', 'EXT_texture_webp'].includes(name)), 'Supported required extensions');
  assert.equal(gltf.asset.extras.meatProxyOptimization.version, 1, 'Optimized export');
  assert(gltf.materials.some(material => material.normalTexture), 'Exported tangent normal map');
  assert(gltf.materials.some(material => material.pbrMetallicRoughness?.metallicRoughnessTexture), 'Exported roughness map');
  const root = gltf.nodes.find(node => node.name === 'Weapon');
  assert.equal(root.extras.assetId, asset.id);
  assert(asset.name && asset.type && !['Muzzle', 'Grip', 'Eject'].includes(asset.type), 'Catalog metadata retains the weapon name and category');
  if (!['brrrt-10', 'heavenfire-67', 'daz-ratatat'].includes(asset.id)) {
    assert.equal(asset.primaryHand, 'right', 'Gun catalog identifies the authored right-hand pose');
    assert.equal(root.extras.primaryHand, 'right', 'Right-hand pose is baked into the GLB');
    assert.equal(root.extras.animationParity, -1, 'Mirrored moving parts retain their animation direction');
    assert(gltf.nodes.every(node => !node.scale || node.scale.every(value => value > 0)), 'Reflections are baked into geometry');
  }
  for (const name of [...asset.parts, ...asset.sockets]) assert(gltf.nodes.some(node => node.name === name), `Missing node ${name}`);
  if (asset.id === 'flaky-assertions') {
    assert.equal(asset.weaponId, 13);
    assert.equal(asset.name, 'Flaky Assertions');
    assert.equal(asset.type, 'Quad flak cannon');
    for (let i = 0; i < 4; i++) {
      const barrel = gltf.nodes.find(node => node.name === `Barrel${i}`);
      assert(barrel?.mesh !== undefined, `Independent moving barrel ${i}`);
      for (const name of [`Muzzle${i}`, `Eject${i}`]) {
        assert(barrel.children?.includes(gltf.nodes.findIndex(node => node.name === name)), `${name} follows its barrel`);
      }
    }
  }
  const muzzle = gltf.nodes.find(node => node.name === 'Muzzle');
  asset.muzzle.forEach((value, i) => assert(Math.abs(value - muzzle.translation[i]) < 1e-6, 'Muzzle uses glTF coordinates'));
  const document = await io.read(new URL(`${asset.id}.glb`, directory).pathname);
  const readAccessor = accessor => Array.from({ length: accessor.getCount() }, (_, i) => accessor.getElement(i, []));
  let triangles = 0, draws = 0;
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const positions = readAccessor(primitive.getAttribute('POSITION'));
    assert(positions.flat().every(Number.isFinite), 'Finite vertex positions');
    for (const normal of readAccessor(primitive.getAttribute('NORMAL'))) assert(Math.abs(Math.hypot(...normal) - 1) < .002, 'Unit normals');
    const indices = readAccessor(primitive.getIndices()).flat();
    assert(indices.every(index => index >= 0 && index < positions.length), 'Indices reference existing vertices');
    assert.equal(indices.length % 3, 0);
    assert.equal(primitive.getMode(), 4, 'Triangle topology');
    triangles += indices.length / 3; draws++;
  }
  assert.equal(triangles, asset.triangles);
  assert.equal(draws, asset.drawCalls);
  if (asset.id === 'daz-ratatat') {
    const keys = gltf.nodes.filter(node => node.extras?.keyCode);
    assert.equal(keys.length, 61, 'Complete 60% keyboard');
    assert.equal(new Set(keys.map(key => key.extras.keyCode)).size, 61);
    for (const code of ['Enter', 'Escape', 'Space', 'KeyA', 'KeyZ']) assert(keys.some(key => key.extras.keyCode === code));
    const letterA = keys.find(key => key.extras.keyCode === 'KeyA');
    const letterL = keys.find(key => key.extras.keyCode === 'KeyL');
    assert(Math.abs(letterA.translation[2] - letterL.translation[2]) > .3, 'Keyboard long axis points forward');
    assert(Math.abs(letterA.translation[0] - letterL.translation[0]) < .001, 'Key rows rotated by 90 degrees');
  }
  totalBytes += bytes.length;
  console.log(`${asset.id}: ${triangles.toLocaleString()} triangles, ${draws} draws, ${(bytes.length / 1048576).toFixed(2)} MiB — valid`);
}
console.log(`All ${manifest.weapons.length} GLBs valid; ${((totalBytes + [...sharedTextures.values()].reduce((a, b) => a + b, 0)) / 1e6).toFixed(2)} MB including shared textures.`);
