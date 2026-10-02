import { PerspectiveCamera, Vector3 } from 'three';
import type { LandscapeConfig } from './landscape-config';
import { sequenceFrame } from './sequence-math';
import { createShoreProfile } from './shoreline-math';
import { nearBankCoast } from './driving-route';

/** Pick the water plane at the displayed time, then restore the cue's world
 * address so its impact stays fixed as the camera pans and the timeline seeks. */
export function lightningWaterPoint(x: number, y: number, aspect: number, timeMs: number, cueMs: number, config: LandscapeConfig) {
  const frame = sequenceFrame(timeMs / 1000, config, aspect);
  const camera = new PerspectiveCamera(frame.fov, aspect, 1, 14000);
  camera.position.fromArray(frame.camera);if(frame.up)camera.up.fromArray(frame.up);
  camera.lookAt(...frame.target); camera.rotateZ(frame.roll); camera.updateMatrixWorld();
  const ray = new Vector3(x, y, .5).unproject(camera).sub(camera.position).normalize();
  if (ray.y >= -.00001) return;
  const distance = (config.water.waterLevel - camera.position.y) / ray.y;
  if (distance <= 0) return;
  const point = camera.position.clone().addScaledVector(ray, distance), ahead = camera.position.z - point.z;
  const worldX = point.x + frame.travel;
  if (ahead < 2 || point.z <= createShoreProfile(config.seed, config.docks).coast(worldX)) return;
  if(config.sequence?.enabled&&config.sequence.bank&&point.z>=nearBankCoast(worldX,config))return;
  return { x: worldX - sequenceFrame(cueMs / 1000, config).travel, distance: ahead };
}
