import * as THREE from 'three';

/** A keyboard shot presses the fitted glove onto the key tops, then rebounds.
 * Measure clearance once at attachment; animation only changes its offset. */
export function createGloveMotion(hand: THREE.Object3D, model: THREE.Object3D, url: string) {
  if (!/\/daz-ratatat\.glb(?:[?#].*)?$/i.test(url)) return undefined;
  const anchor = hand.parent, fabric = hand.getObjectByName('GloveFabric');
  if (!anchor?.parent || !(fabric instanceof THREE.SkinnedMesh)) return undefined;
  model.updateWorldMatrix(true, false);
  model.updateMatrixWorld(true);
  const toBoard = anchor.parent.matrixWorld.clone().invert();
  const keys = new THREE.Box3(), box = new THREE.Box3();
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh) || typeof node.userData.keyCode !== 'string') return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    box.copy(node.geometry.boundingBox!).applyMatrix4(toBoard.clone().multiply(node.matrixWorld));
    keys.union(box);
  });
  if (keys.isEmpty()) return undefined;
  const fabricToBoard = toBoard.clone().multiply(fabric.matrixWorld), point = new THREE.Vector3();
  let lowest = Infinity;
  for (let i = 0; i < fabric.geometry.attributes.position.count; i++) {
    fabric.getVertexPosition(i, point).applyMatrix4(fabricToBoard);
    if (point.x >= keys.min.x && point.x <= keys.max.x && point.z >= keys.min.z && point.z <= keys.max.z) {
      lowest = Math.min(lowest, point.y);
    }
  }
  const clearance = Number.isFinite(lowest) ? lowest - keys.max.y : 0;
  const stroke = THREE.MathUtils.clamp(clearance - .001, 0, .06);
  const lift = .016;
  // Offsets are in keyboard metres, independent of the fit's rotation/scale.
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(anchor.quaternion.clone().invert()).divide(anchor.scale);
  const rest = hand.position.clone();
  const ease = (t: number) => { const x = THREE.MathUtils.clamp(t, 0, 1); return x * x * (3 - 2 * x); };
  return {
    update(time: number, shot: number, reducedMotion: boolean) {
      const age = time - shot;
      let offset = 0;
      if (!reducedMotion && shot > 0 && age >= 0 && age < 90) {
        if (age < 18) offset = -stroke * ease(age / 18);
        else if (age < 55) offset = THREE.MathUtils.lerp(-stroke, lift, ease((age - 18) / 37));
        else offset = lift * (1 - ease((age - 55) / 35));
      }
      hand.position.copy(rest).addScaledVector(up, offset);
    }
  };
}

export type GloveMotion = ReturnType<typeof createGloveMotion>;
