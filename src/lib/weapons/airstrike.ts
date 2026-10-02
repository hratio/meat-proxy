import * as THREE from 'three';
import type { Config } from '../config';
import { createModelLoader } from '../models/loader';
import { airstrikeModel, airstrikePose, getAirstrikeTiming, type AirstrikeRect } from '../game-events/color-unlock';
import { cancelFrame, nextFrame, type RenderEngine, type RenderOptions, type RenderSize } from '../render/surface';
import { createWeaponMotion, disposeWeapon, frameWeapon, lightWeaponScene, type WeaponMotion } from './runtime';
import { createWeaponLighting } from './lighting';
import { createWeaponEffects } from './effects';
import { loadWeaponTextures } from './textures';
import { prepareWeapon } from './prepare';
import { weaponProfile } from './profiles';

export type AirstrikeState = {
  elapsed: number; reduced: boolean; showAircraft: boolean;
  target: AirstrikeRect; weapons: Config['weapons'];
};
export type AirstrikeEvent = { type: 'ready'; available: boolean };

/** A single bare aircraft in the dialog viewport, driven by the sequence's clock. */
export async function createAirstrikeRenderer(options: RenderOptions<AirstrikeState, AirstrikeEvent>): Promise<RenderEngine<AirstrikeState>> {
  const artwork = await loadWeaponTextures(options.state.weapons.effects.textureSize);
  if (options.current && !options.current()) { artwork.release(); throw new Error('Airstrike disposed while loading'); }
  let state = options.state, disposed = false, prepared = false, previous = 0, frame = 0;
  let width = Math.max(1, options.size.width), height = Math.max(1, options.size.height);
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: options.canvas, alpha: true, antialias: true }); }
  catch (error) { artwork.release(); throw error; }
  renderer.debug.checkShaderErrors = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-4, 4, 4, -4, .1, 100);
  camera.position.z = 12;
  const environment = lightWeaponScene(renderer, scene), lighting = createWeaponLighting(renderer, scene);
  lighting.update(state.weapons.lighting, state.weapons.exposure);
  const aircraft = new THREE.Group(); aircraft.visible = false; scene.add(aircraft);
  const bank = new THREE.Group(); aircraft.add(bank);
  const effects = createWeaponEffects(scene, camera, () => state.weapons.effects, artwork.images);
  const tracerGeometry = new THREE.BufferGeometry();
  const tracerPositions = new Float32Array(8 * 6);
  tracerGeometry.setAttribute('position', new THREE.BufferAttribute(tracerPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const tracers = new THREE.LineSegments(tracerGeometry, new THREE.LineBasicMaterial({ color: '#ffe3a1', transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthTest: false, toneMapped: false }));
  tracers.frustumCulled = false; tracers.visible = false; scene.add(tracers);
  const muzzlePoint = new THREE.Vector3(), aimPoint = new THREE.Vector3();
  let muzzle: THREE.Object3D | undefined, motion: WeaponMotion | undefined;
  const point = (x: number, y: number, out: THREE.Vector3) => out.set((x - width / 2) * 8 / height, (height / 2 - y) * 8 / height, 0);

  const render = () => {
    frame = 0;
    if (disposed) return;
    const { elapsed, target, reduced } = state;
    const timing = getAirstrikeTiming();
    const pose = airstrikePose(elapsed, width, target, reduced);
    aircraft.visible = prepared && state.showAircraft && pose.visible;
    tracers.visible = aircraft.visible && pose.firing && !reduced;
    if (aircraft.visible) {
      point(pose.x, pose.y, aircraft.position);
      aircraft.scale.setScalar(pose.size / 2 * 8 / height);
      aircraft.rotation.z = THREE.MathUtils.degToRad(pose.angleDeg);
      // Mirror yaw and roll together to keep the same side of the fuselage facing the viewer.
      bank.rotation.set(0, -pose.facing * Math.PI / 2, 0);
      bank.rotateZ(THREE.MathUtils.degToRad(-pose.facing * pose.bankDeg));
      const delta = Math.min(50, Math.max(0, elapsed - previous)); previous = elapsed;
      const shot = pose.firing ? timing.burstStartMs + Math.floor((elapsed - timing.burstStartMs) / 40) * 40 : -10000;
      motion?.update(elapsed, delta, shot, pose.firing, 0, reduced);
      const sweep = Math.max(0, Math.min(1, (elapsed - timing.burstStartMs) / Math.max(1, timing.burstEndMs - timing.burstStartMs)));
      point(target.left + target.width * (pose.facing === 1 ? .15 + sweep * .7 : .85 - sweep * .7), target.top + target.height * .56, aimPoint);
      effects.update(elapsed, delta, [shot], [pose.firing], 55, reduced, aimPoint);
      if (tracers.visible && muzzle) {
        aircraft.updateWorldMatrix(true, true); muzzle.getWorldPosition(muzzlePoint);
        for (let i = 0; i < 8; i++) {
          const progress = ((elapsed - timing.burstStartMs + i * 17) % 150) / 150;
          const end = Math.min(1, progress + .15);
          const spread = Math.sin(i * 12.3 + Math.floor(elapsed / 80)) * .18;
          for (let j = 0; j < 2; j++) {
            const t = j ? end : progress, offset = i * 6 + j * 3;
            tracerPositions[offset] = THREE.MathUtils.lerp(muzzlePoint.x, aimPoint.x + spread, t);
            tracerPositions[offset + 1] = THREE.MathUtils.lerp(muzzlePoint.y, aimPoint.y - spread, t);
            tracerPositions[offset + 2] = THREE.MathUtils.lerp(muzzlePoint.z, 1, t);
          }
        }
        tracerGeometry.attributes.position.needsUpdate = true;
      }
    } else effects.clear();
    renderer.render(scene, camera);
  };
  // Coalesce incoming clock updates so a slow frame never queues old flight poses.
  const schedule = () => { if (prepared && !disposed && !frame) frame = nextFrame(render); };
  const resize = (size: RenderSize) => {
    width = Math.max(1, size.width); height = Math.max(1, size.height);
    renderer.setPixelRatio(Math.min(size.pixelRatio, state.weapons.pixelRatio));
    renderer.setSize(width, height, false);
    camera.left = -width / height * 4; camera.right = width / height * 4;
    camera.updateProjectionMatrix();
    schedule();
  };
  resize(options.size);
  void (async () => {
    try {
      const model = (await createModelLoader().loadAsync(airstrikeModel)).scene;
      if (disposed) { disposeWeapon(model); return; }
      // The animated bank exposes the upper fuselage, wings and twin engines to the viewer.
      bank.add(frameWeapon(model));
      muzzle = model.getObjectByName('Muzzle'); motion = createWeaponMotion(model);
      effects.mount(0, aircraft, model, weaponProfile(airstrikeModel, state.weapons.profiles));
      await environment.ready;
      if (disposed) return;
      await effects.prepare(renderer, () => !disposed);
      if (disposed || !await prepareWeapon(renderer, scene, camera, aircraft, () => !disposed)) return;
      prepared = true; render(); options.emit({ type: 'ready', available: true });
    } catch {
      if (!disposed) options.emit({ type: 'ready', available: false });
    }
  })();
  return {
    update(patch) {
      state = { ...state, ...patch };
      if (patch.weapons) lighting.update(state.weapons.lighting, state.weapons.exposure);
      schedule();
    },
    resize,
    dispose() {
      disposed = true; cancelFrame(frame);
      tracerGeometry.dispose(); tracers.material.dispose();
      effects.dispose(); artwork.release(); lighting.dispose(); disposeWeapon(scene); environment(); renderer.dispose(); renderer.forceContextLoss();
    }
  };
}
