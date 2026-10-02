import * as THREE from 'three';
import { afterFrame as afterPaint } from '../render/surface.ts';

/** Prepare a mounted, hidden weapon using the same renderer and lighting as its reveal. */
export async function prepareWeapon(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  weapon: THREE.Object3D, current: () => boolean) {
  await afterPaint();
  if (!current()) return false;
  // compile() collects lights from both arguments for an unmounted object.
  // A mounted effects group must not count its own lights twice.
  let hasLights = false;
  weapon.traverse(node => { if (node instanceof THREE.Light) hasLights = true; });
  await renderer.compileAsync(hasLights ? scene : weapon, camera, scene);
  if (!current()) return false;

  const textures = new Set<THREE.Texture>();
  weapon.traverse(node => {
    if (!(node instanceof THREE.Mesh) && !(node instanceof THREE.Sprite)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  let uploadStart = performance.now();
  for (const texture of textures) {
    renderer.initTexture(texture);
    if (performance.now() - uploadStart >= 4) {
      await afterPaint();
      if (!current()) return false;
      uploadStart = performance.now();
    }
  }
  await afterPaint();
  if (!current()) return false;

  // A zero-pixel scissor uploads geometry, skinning and draw state without
  // painting over the review. Keeping the canvas target also keeps the exact
  // output-color and tone-mapping shaders used by the visible weapon.
  const scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
  const objects: { node: THREE.Object3D; visible: boolean; culled: boolean }[] = [];
  weapon.traverse(node => objects.push({ node, visible: node.visible, culled: node.frustumCulled }));
  try {
    for (const { node } of objects) { node.visible = true; node.frustumCulled = false; }
    renderer.setScissor(0, 0, 0, 0);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);
  } finally {
    for (const { node, visible, culled } of objects) { node.visible = visible; node.frustumCulled = culled; }
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
  }
  await afterPaint();
  return current();
}
