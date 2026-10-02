import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MathUtils, Triangle, Vector3 } from 'three';
import { artwork } from '../../../src/lib/avatar/artwork.ts';
import { generatePortraitLut, lutSize } from '../splash/color-workshop/lut.mjs';

const root = new URL('../../../', import.meta.url);
const model = new URL('static/models/mockdaddy-expressions.glb', root);
const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(fileURLToPath(model));
const samples = {};
const a = new Vector3(), b = new Vector3(), c = new Vector3(), point = new Vector3(), weights = new Vector3();
for (const [name, data] of Object.entries(artwork)) {
  const face = `MockDaddy_${name}_Face`;
  const node = document.getRoot().listNodes().find(node => node.getName() === face);
  const primitive = node.getMesh().listPrimitives()[0];
  const uv = primitive.getAttribute('TEXCOORD_0').getArray(), indices = primitive.getIndices().getArray();
  const result = samples[face] = {};
  function attach(x, y) {
    point.set(x, y, 0);
    let best = -Infinity, match;
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [indices[i], indices[i + 1], indices[i + 2]];
      for (const [j, vertex] of [a, b, c].entries()) vertex.set(uv[ids[j] * 2], uv[ids[j] * 2 + 1], 0);
      Triangle.getBarycoord(point, a, b, c, weights);
      const score = Math.min(weights.x, weights.y, weights.z);
      if (score > best) { best = score; match = [...ids, ...weights.toArray()]; }
      if (score >= -1e-6) break;
    }
    if (best < -.03) throw new Error(`Surface attachment outside ${face}: ${x}, ${y}`);
    result[`${x.toFixed(12)},${y.toFixed(12)}`] = match;
  }
  const normalize = p => name === 'Idle' ? p : [p[0] / 1536, p[1] / 1024];
  attach(...normalize(data.tip));
  for (const polygon of data.lenses) {
    const points = polygon.map(normalize);
    const center = points.reduce((p, q) => [p[0] + q[0] / points.length, p[1] + q[1] / points.length], [0, 0]);
    attach(...center);
    const segments = points.length * 4;
    for (let ring = 1; ring <= 4; ring++) for (let i = 0; i < segments; i++) {
      const p = points[Math.floor(i / 4)], q = points[(Math.floor(i / 4) + 1) % points.length], t = (i % 4) / 4, r = ring / 4;
      attach(MathUtils.lerp(center[0], MathUtils.lerp(p[0], q[0], t), r), MathUtils.lerp(center[1], MathUtils.lerp(p[1], q[1], t), r));
    }
  }
}
const output = JSON.stringify({ samples }) + '\n';
await writeFile(new URL('src/lib/avatar/attachments.json', root), output);

const recipe = JSON.parse(await readFile(new URL('dev/assets/recipes/portrait/natural-grade.json', root), 'utf8'));
const pixels = generatePortraitLut(recipe), lut = Buffer.alloc(8 + pixels.length);
lut.write('PRDL'); lut.writeUInt32LE(lutSize, 4); lut.set(pixels, 8);
await writeFile(new URL('src/lib/avatar/portrait-lut.bin', root), lut);
console.log(`Prepared ${Object.values(samples).reduce((count, map) => count + Object.keys(map).length, 0)} portrait attachments and ${lutSize}³ LUT.`);
