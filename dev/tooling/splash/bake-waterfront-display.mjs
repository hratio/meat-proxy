import assert from 'node:assert/strict';
import { BufferAttribute, BufferGeometry } from 'three';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { bakeCrownDisplayMask } from '../../../src/lib/components/splash/crown-display-mask.mjs';

/** Bake the existing runtime sign during export; preserve editable Blender glyphs. */
export async function bakeWaterfrontDisplay(document) {
  const node = document.getRoot().listNodes().find(node => node.getName() === 'CrownGate');
  if (!node?.getExtras().waterfrontDisplay || node.getExtras().waterfrontDisplayMask === 1) return;
  const primitives = node.getMesh().listPrimitives();
  assert.equal(primitives.length, 1, 'Crown display requires the authored combined mesh');
  const primitive = primitives[0], geometry = new BufferGeometry();
  for (const [semantic, attribute] of [['POSITION', 'position'], ['TEXCOORD_0', 'uv'], ['TEXCOORD_1', 'uv1']]) {
    const source = primitive.getAttribute(semantic);
    assert(source, `Crown display is missing ${semantic}`);
    geometry.setAttribute(attribute, new BufferAttribute(source.getArray(), source.getElementSize(), source.getNormalized()));
  }
  const index = primitive.getIndices();
  assert(index, 'Crown display requires indexed triangles');
  geometry.setIndex(new BufferAttribute(index.getArray(), 1));
  const { data, width, height } = bakeCrownDisplayMask(geometry);
  assert(data.some(value => value > 0), 'Crown display must contain the authored letters');
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) { rgb[i*3] = data[i*2]; rgb[i*3+1] = data[i*2+1]; }
  // Lossless WebP preserves both channels exactly, at the full mask resolution.
  const image = await sharp(rgb, { raw: { width, height, channels: 3 } }).webp({ lossless: true, effort: 4 }).toBuffer();
  document.createExtension(EXTTextureWebP).setRequired(true);
  const texture = document.createTexture('CrownGate / display core and glow')
    .setImage(image).setMimeType('image/webp').setExtras({ waterfrontDisplayMask: 1 });
  const material = primitive.getMaterial().clone().setName('CrownGate / baked display carrier');
  material.setBaseColorTexture(texture);
  material.getBaseColorTextureInfo().setTexCoord(1);
  primitive.setMaterial(material);
  const role = geometry.getAttribute('uv'), indices = [];
  for (let i = 0; i < index.getCount(); i += 3) {
    const a = index.getScalar(i);
    if (Math.round((1-role.getY(a))*8) !== 11) indices.push(a, index.getScalar(i+1), index.getScalar(i+2));
  }
  primitive.setIndices(document.createAccessor('CrownGate / visible surface indices')
    .setType('SCALAR').setBuffer(index.getBuffer()).setArray(new Uint32Array(indices)));
  node.setExtras({ ...node.getExtras(), waterfrontDisplayMask: 1 });
  geometry.dispose();
  return { bytes: image.length, omittedTriangles: (index.getCount()-indices.length)/3 };
}
