// Add or update the same exported socket without touching any mesh, material,
// muzzle, animation pivot or binary buffer. Safe to rerun after a fit adjustment.
import { readFile, writeFile } from 'node:fs/promises';
const directory = new URL('../../../static/models/weapons/', import.meta.url);
const anchors = JSON.parse(await readFile(new URL('../../assets/recipes/weapons/hand-anchors.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
const requested = process.argv.slice(2);
const targets = manifest.weapons.filter(asset => !requested.length || requested.includes(asset.id));
if (requested.some(id => !targets.some(asset => asset.id === id))) throw new Error('Unknown weapon ID');
for (const asset of targets) {
  const path = new URL(`${asset.id}.glb`, directory), bytes = await readFile(path);
  const length = bytes.readUInt32LE(12), doc = JSON.parse(bytes.subarray(20, 20 + length).toString());
  const root = doc.nodes.find(node => node.name === 'Weapon');
  let index = doc.nodes.findIndex(node => node.name === 'HandAnchor');
  if (index < 0) { index = doc.nodes.length; doc.nodes.push({}); root.children.push(index); }
  const { hand = 'right', ...transform } = anchors[asset.id];
  const anchor = { name: 'HandAnchor', ...transform, extras: { glove: 'reviewer-glove', hand, version: 1 } };
  doc.nodes[index] = anchor;
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const binary = bytes.subarray(20 + length), header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(20 + padded.length + binary.length, 8); header.writeUInt32LE(padded.length, 12);
  const output = Buffer.concat([header, padded, binary]); await writeFile(path, output);
  if (asset.downloadBytes !== undefined) asset.downloadBytes += output.length - asset.bytes;
  asset.bytes = output.length; asset.handAnchor = anchors[asset.id];
  if (!asset.sockets.includes('HandAnchor')) asset.sockets.push('HandAnchor');
}
const json = JSON.stringify(manifest, null, 2) + '\n';
await writeFile(new URL('manifest.json', directory), json);
await writeFile(new URL('../../../src/lib/weapons/manifest.json', import.meta.url), json);
console.log(`Updated ${targets.length} HandAnchor sockets and asset manifests.`);
