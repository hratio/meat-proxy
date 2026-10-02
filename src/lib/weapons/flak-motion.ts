import * as THREE from 'three';

// Alternate diagonally. Each gameplay shot advances once, independent of frame
// rate or trigger hold duration; flashes and cases follow that same barrel.
const order = [0, 3, 1, 2];
export function createFlakMotion(model: THREE.Object3D, previousShot = -1) {
  const barrels = order.map(index => {
    const node = model.getObjectByName(`Barrel${index}`);
    const muzzle = model.getObjectByName(`Muzzle${index}`);
    const eject = model.getObjectByName(`Eject${index}`);
    return node && muzzle && eject ? { node, muzzle, eject, rest: node.position.clone(), fired: -Infinity } : undefined;
  });
  if (barrels.some(barrel => !barrel)) return;
  const muzzle = model.getObjectByName('Muzzle'), eject = model.getObjectByName('Eject');
  const position = new THREE.Vector3();
  let lastShot = previousShot, next = 0, active = 0;
  const follow = (target: THREE.Object3D | undefined, source: THREE.Object3D) => {
    if (!target?.parent) return;
    source.getWorldPosition(position);
    target.position.copy(target.parent.worldToLocal(position));
  };
  return {
    update(time: number, shot: number, reducedMotion: boolean, recoilScale = 1) {
      if (shot > 0 && shot > lastShot) {
        lastShot = shot;
        active = next;
        next = (next + 1) % barrels.length;
        barrels[active]!.fired = shot;
      }
      for (const barrel of barrels) {
        const age = time - barrel!.fired;
        // A hard rearward impulse with a damped 220 ms return. The authored
        // barrel keeps its length and slides through its stationary sleeve.
        const travel = reducedMotion || shot <= 0 || age < 0 ? 0 : .145 * recoilScale * Math.pow(Math.max(0, 1 - age / 220), 2);
        barrel!.node.position.copy(barrel!.rest);
        barrel!.node.position.z += travel;
      }
      follow(muzzle, barrels[active]!.muzzle);
      follow(eject, barrels[active]!.eject);
    }
  };
}
