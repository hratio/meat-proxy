// Material-only patch: retain the Draco stream, shared textures and grip fits.
import { readFile, writeFile } from 'node:fs/promises';
import { readGLB, writeGLB } from '../models/glb.mjs';
const directory = new URL('../../../static/models/weapons/', import.meta.url);
const path = new URL('rhein-9.glb', directory);
const bytes = await readFile(path), { json, binary } = readGLB(bytes);
const glass = json.materials.find(material => /^Arsenal \/ (?:optic-)?glass$/.test(material.name));
if (!glass) throw new Error('Rhein-9 optic material is missing');
Object.assign(glass, {
  name: 'Arsenal / optic-glass', alphaMode: 'BLEND', doubleSided: false,
  pbrMetallicRoughness: { baseColorFactor: [.50, .76, .80, .13], metallicFactor: 0, roughnessFactor: .08 }
});
const output = writeGLB(json, binary);
await writeFile(path, output);
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
const asset = manifest.weapons.find(weapon => weapon.id === 'rhein-9');
asset.downloadBytes += output.length - asset.bytes;
asset.bytes = output.length;
const text = JSON.stringify(manifest, null, 2) + '\n';
await writeFile(new URL('manifest.json', directory), text);
await writeFile(new URL('../../../src/lib/weapons/manifest.json', import.meta.url), text);
console.log('Rhein-9 optic: clear alpha glass, original geometry retained.');
