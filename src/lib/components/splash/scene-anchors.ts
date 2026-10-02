import { Matrix3, PerspectiveCamera, Vector3 } from 'three';
import type { LandscapeConfig } from './landscape-config';

export const cityPeriod = 2400;

// Keep the normalized moon controls on the approved composition's sky chart.
// This reference is deliberately independent of both camera edits and playback.
const skyReferenceLens = { height: 2.2, distance: 230, targetHeight: 300, fov: 75, yaw: 0, roll: 0 };

/** A fixed 16:9 sky chart converts the existing placement controls to a world direction. */
export function moonAnchor(world: LandscapeConfig) {
  const lens = skyReferenceLens, light = world.lighting;
  const camera = new PerspectiveCamera(lens.fov, 16 / 9, 1, 14000);
  camera.position.set(0, lens.height, lens.distance);
  camera.lookAt(Math.tan(lens.yaw * Math.PI / 180) * (lens.distance + 700), lens.targetHeight, -700);
  camera.rotateZ(lens.roll * Math.PI / 180); camera.updateMatrixWorld();
  const direction = new Vector3(light.moonX * 2 - 1, light.moonY * 2 - 1, 1).unproject(camera).sub(camera.position).normalize();
  return { direction, reference: new Matrix3().setFromMatrix4(camera.matrixWorldInverse), tangent: Math.tan(lens.fov * Math.PI / 360) };
}
