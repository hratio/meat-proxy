import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule()
}), path = process.argv[2] || 'static/scenery/driving-set.glb';
const doc = await io.read(path);
// Retained Ferat cabin maps are viewed in a dark first-person interior.
// A 256px atlas matches the previous cabin delivery; keep original source maps.
await doc.transform(dedup(), weld(), prune({ keepLeaves: true }), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], quality: 80 }));
await doc.transform(draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 12, quantizeGeneric: 16 }));
doc.getRoot().setExtras({ ...doc.getRoot().getExtras(), waterfrontCompression: 1 });
await io.write(path, doc);
