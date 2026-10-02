import { assetUrl } from '../asset-url';
import { Mesh, Texture, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

let source: Promise<GLTF> | undefined, users = 0;

function disposeModel(root: Object3D) {
  const textures = new Set<Texture>(), geometries = new Set<Mesh['geometry']>(), materials = new Set<Mesh['material']>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  const bitmaps = new Set<ImageBitmap>();
  for (const texture of textures) {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) bitmaps.add(texture.image);
    texture.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
  for (const material of materials) if (!Array.isArray(material)) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

/** Independent animation hierarchies share decoded geometry and texture data. */
export async function loadPortraitModel() {
  users++;
  const pending = source ??= new GLTFLoader().loadAsync(assetUrl('/models/mockdaddy-expressions.glb'));
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (--users === 0 && source === pending) {
      source = undefined;
      void pending.then(model => disposeModel(model.scene), () => {});
    }
  };
  try {
    const template = await pending;
    const gltf = { ...template, scene: clone(template.scene) as GLTF['scene'] };
    return { gltf, release };
  } catch (error) { release(); throw error; }
}
