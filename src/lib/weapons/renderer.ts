import * as THREE from 'three';
import { createModelLoader } from '../models/loader';
import { applyWeaponSlotPose, createWeaponMotion, disposeWeapon, frameHeldWeapon, lightWeaponScene, type WeaponMotion } from './runtime';
import { createWeaponEffects } from './effects';
import { loadWeaponTextures } from './textures';
import { prepareWeapon } from './prepare';
import { createWeaponLighting } from './lighting';
import type { WeaponLighting } from './lighting-config';
import { weaponProfile } from './profiles';
import { weaponCharge } from './charge';
import { createSprayPose } from './spray-pose';
import type { Config } from '../config';
import { fitGlove, loadGloves, type GloveLibrary } from '../gloves/runtime';
import { createGloveMotion, type GloveMotion } from '../gloves/motion';
import { nextFrame, cancelFrame, renderClock, type RenderEngine, type RenderOptions, type RenderSize } from '../render/surface';

export type WeaponState = {
  config: Pick<Config, 'weapons' | 'gloves'> & { display: Pick<Config['display'], 'reducedMotion'>; gameplay: Pick<Config['gameplay'], 'reloadMs'> };
  paused: boolean; hidden: boolean;
  layout: { bounds: { left: number; top: number; width: number; height: number }; placement: { left: number; top: number; width: number; height: number } };
  mainModel?: string; secondaryModel?: string; mainDrawn: boolean; secondaryDrawn: boolean;
  mainHolster: number; secondaryHolster: number; mainShot: number; secondaryShot: number;
  mainShotCharge: number; secondaryShotCharge: number; mainFiringSince: number; secondaryFiringSince: number;
  reload: number; pointer: { x: number; y: number };
};
export type WeaponEvent = { type: 'ready'; slot: number; url: string; ready: boolean } | { type: 'error'; message: string };

export async function createWeaponRenderer(options: RenderOptions<WeaponState, WeaponEvent>): Promise<RenderEngine<WeaponState>> {
  const artwork = await loadWeaponTextures(options.state.config.weapons.effects.textureSize);
  if (options.current && !options.current()) { artwork.release(); throw new Error('Weapon renderer disposed while loading'); }
  let state = { ...options.state };
  let { config, paused, hidden, layout, mainModel, secondaryModel, mainDrawn, secondaryDrawn, mainHolster, secondaryHolster,
    mainShot, secondaryShot, mainShotCharge, secondaryShotCharge, mainFiringSince, secondaryFiringSince, reload, pointer } = state;
  const { canvas, emit } = options, clock = renderClock(options.timeOrigin);
  const modelReady = [false, false];
  const onready = (slot: number, url: string) => emit({ type: 'ready', slot, url, ready: !!url && modelReady[slot] });
  let updateModels: ((main: string, secondary: string) => void) | undefined;
  let setPaused: ((paused: boolean) => void) | undefined;
  let updateGloves: ((value: Config['gloves'], reducedMotion: boolean) => void) | undefined;
  let updateLighting: ((value: WeaponLighting, exposure: number) => void) | undefined;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); }
  catch (error) { artwork.release(); throw error; }
  // Stock materials do not need synchronous GPU diagnostic queries during preparation.
  renderer.debug.checkShaderErrors = false;
  const scene = new THREE.Scene();
  const disposeEnvironment = lightWeaponScene(renderer, scene);
  const camera = new THREE.PerspectiveCamera(config.weapons.fov, 1, .1, 30);
  camera.position.z = 6;
  renderer.setPixelRatio(Math.min(options.size.pixelRatio, config.weapons.pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const lighting = createWeaponLighting(renderer, scene);
  lighting.update(config.weapons.lighting, config.weapons.exposure);
  const main = new THREE.Group(), secondary = new THREE.Group();
  main.visible = secondary.visible = false;
  scene.add(main, secondary);
  let disposed = false;
  const motions: (WeaponMotion | undefined)[] = [];
  const sprayPoses = [createSprayPose(), createSprayPose()];
  const loader = createModelLoader();
  const fallback = (group: THREE.Group) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(.45, .5, 1.5), new THREE.MeshStandardMaterial({ color: 0x55564a, metalness: .7, roughness: .4 }));
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 1, 8), new THREE.MeshStandardMaterial({ color: 0x252623, metalness: .8, roughness: .3 }));
    barrel.rotation.x = Math.PI / 2; barrel.position.z = -.8; group.add(body, barrel);
  };
  const bodies = [new THREE.Group(), new THREE.Group()];
  main.add(bodies[0]); secondary.add(bodies[1]);
  const effects = createWeaponEffects(scene, camera, () => config.weapons.effects, artwork.images);
  const urls = ['', ''];
  const requests = [0, 0];
  let gloves: GloveLibrary | undefined, gloveLoading = false;
  let glovesReady: Promise<void> | undefined;
  let gloveConfig = config.gloves;
  const hands: (THREE.Object3D | undefined)[] = [];
  const handMotions: GloveMotion[] = [];
  const held: ({ model: THREE.Object3D; normalized: THREE.Object3D; url: string } | undefined)[] = [];
  const removeHand = (slot: number) => { if (hands[slot]) gloves?.release(hands[slot]); hands[slot] = undefined; handMotions[slot] = undefined; };
  const addHand = (slot: number) => {
    const mount = held[slot];
    if (!gloves || !mount || !gloveConfig.enabled || hands[slot]) return;
    const hand = gloves.create();
    if (fitGlove(hand, mount.model, mount.normalized, mount.url, slot)) {
      gloves.setHand(hand);
      hands[slot] = hand;
      handMotions[slot] = createGloveMotion(hand, mount.model, mount.url);
    }
    else gloves.release(hand);
  };
  updateGloves = (value, reducedMotion) => {
    gloveConfig = value;
    if (gloves) {
      gloves.configure(value); gloves.update(clock.now(), reducedMotion);
      for (let slot = 0; slot < 2; slot++) {
        addHand(slot); const hand = hands[slot]; if (hand) hand.visible = value.enabled;
        if (reducedMotion) handMotions[slot]?.update(clock.now(), slot === 0 ? mainShot : secondaryShot, true);
      }
      if (suspended && rendered) renderer.render(scene, camera);
    } else if (value.enabled && !gloveLoading) {
      gloveLoading = true;
      glovesReady = loadGloves().then(library => {
        if (disposed) { library.dispose(); return; }
        gloves = library; updateGloves?.(gloveConfig, config.display.reducedMotion);
      }).catch(error => { if (!disposed) console.warn('Glove model could not be loaded', error); });
    }
  };
  const load = async (url: string, slot: number) => {
    if (url === urls[slot]) return;
    urls[slot] = url;
    const request = ++requests[slot];
    const current = () => !disposed && request === requests[slot];
    onready?.(slot, '');
    const body = bodies[slot];
    const gun = slot === 0 ? main : secondary;
    const replace = async (object: THREE.Object3D, model?: THREE.Object3D) => {
      // Gloves load alongside both weapons. Include them in the first GPU
      // preparation so they do not pop in after the weapon has risen.
      if (gloveConfig.enabled) await glovesReady;
      if (!current()) { disposeWeapon(object); return; }
      modelReady[slot] = false;
      gun.visible = false;
      effects.unmount(slot);
      sprayPoses[slot].reset();
      removeHand(slot);
      disposeWeapon(body); body.clear(); body.add(object);
      held[slot] = model ? { model, normalized: object, url } : undefined;
      motions[slot] = model ? createWeaponMotion(model, slot === 0 ? mainShot : secondaryShot, () => weaponProfile(url, config.weapons.profiles)) : undefined;
      effects.mount(slot, gun, model, weaponProfile(url, config.weapons.profiles));
      addHand(slot);
      try {
        await disposeEnvironment.ready;
        if (!current()) return;
        await effects.prepare(renderer, () => !disposed);
        if (!current()) return;
        if (!await prepareWeapon(renderer, scene, camera, gun, current)) return;
        modelReady[slot] = true;
      } catch (error) {
        if (!current()) return;
        emit({ type: 'error', message: String(error) });
        console.warn('Weapon could not be prepared', error);
      }
      if (suspended) render(clock.now(), true);
      onready?.(slot, url);
    };
    try {
      const model = (await loader.loadAsync(url)).scene;
      if (disposed || request !== requests[slot]) { disposeWeapon(model); return; }
      const normalized = frameHeldWeapon(model);
      applyWeaponSlotPose(normalized, url, slot, slot === 0 ? config.weapons.mainModelYaw : config.weapons.secondaryModelYaw);
      // Preserve authored PBR materials unless the user explicitly opts into tinting.
      if (!config.weapons.preserveMaterials) model.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (material instanceof THREE.MeshStandardMaterial) material.color.set(slot === 0 ? config.weapons.mainTint : config.weapons.secondaryTint);
        }
      });
      await replace(normalized, model);
    } catch {
      if (current()) { const model = new THREE.Group(); fallback(model); await replace(model); }
    }
  };
  updateModels = (mainUrl, secondaryUrl) => { void load(mainUrl, 0); void load(secondaryUrl, 1); };
  const keyDown = (event: { code: string }) => {
    if (suspended) return;
    for (const motion of motions) motion?.keyDown(event.code, clock.now());
  };
  const keyUp = (event: { code: string }) => { for (const motion of motions) motion?.keyUp(event.code); };
  const releaseKeys = () => { for (const motion of motions) motion?.releaseKeys(); };
  let width = Math.max(1, options.size.width), height = Math.max(1, options.size.height);
  const resize = (size: RenderSize) => {
    options.size = size; width = Math.max(1, size.width); height = Math.max(1, size.height);
    renderer.setPixelRatio(Math.min(size.pixelRatio, config.weapons.pixelRatio));
    renderer.setSize(width, height, false);
    if (rendered) render(clock.now(), true);
  };
  renderer.setSize(width, height, false);
  let raf = 0, lastFrame = 0;
  let suspended = paused, rendered = false;
  updateLighting = (value, exposure) => {
    lighting.update(value, exposure);
    if (suspended && rendered) renderer.render(scene, camera);
  };
  const heat = [0, 0];
  const charges = [0, 0];
  const aimPoint = new THREE.Vector3(0, 0, -config.weapons.aimDepth);
  const desiredAim = new THREE.Vector3();
  const aimRotation = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const render = (time: number, force = false) => {
    if (!suspended && !hidden) raf = nextFrame(time => render(clock.fromFrame(time)));
    if ((!force && time - lastFrame < 1000 / config.weapons.fps) || hidden) return;
    const delta = Math.min(time - lastFrame, 100); lastFrame = time;
    const frameHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const { bounds, placement } = layout;
    const placementWidth = Math.max(1, placement.width), placementHeight = Math.max(1, placement.height);
    const offsetX = bounds.left - placement.left, offsetY = bounds.top - placement.top;
    // Extend the view beyond the code column while keeping its optical center,
    // weapon positions and cursor projection exactly where they were.
    const view = camera.view;
    if (!view || view.fullWidth !== placementWidth || view.fullHeight !== placementHeight || view.offsetX !== offsetX || view.offsetY !== offsetY || view.width !== width || view.height !== height) {
      camera.setViewOffset(placementWidth, placementHeight, offsetX, offsetY, width, height);
    }
    const px = (pointer.x - placement.left) / placementWidth * 2 - 1;
    const py = 1 - (pointer.y - placement.top) / placementHeight * 2;
    // Project the cursor onto one plane behind the weapons. Both -Z barrels
    // converge on that point, regardless of their position in the HUD.
    const targetHeight = frameHeight * (camera.position.z + config.weapons.aimDepth) / camera.position.z;
    desiredAim.set(px * targetHeight * camera.aspect / 2, py * targetHeight / 2, -config.weapons.aimDepth);
    const response = config.display.reducedMotion || !config.weapons.aimResponseMs ? 1 : 1 - Math.exp(-delta / config.weapons.aimResponseMs);
    aimPoint.lerp(desiredAim, response);
    const reloading = Math.max(0, 1 - (clock.now() - reload) / config.gameplay.reloadMs);
    [main, secondary].forEach((gun, i) => {
      const drawn = i === 0 ? mainDrawn : secondaryDrawn;
      const holster = THREE.MathUtils.clamp(i === 0 ? mainHolster : secondaryHolster, 0, 1);
      const side = i ? -1 : 1;
      const shotTime = i === 0 ? mainShot : secondaryShot;
      const firingSince = i ? secondaryFiringSince : mainFiringSince;
      const profile = weaponProfile(urls[i], config.weapons.profiles);
      const heldMs = firingSince < 0 ? -1 : Math.max(0, time - firingSince);
      charges[i] = drawn && !suspended ? weaponCharge(heldMs, profile) : 0;
      const spray = sprayPoses[i].update(delta, heldMs, profile, config.display.reducedMotion);
      const recoil = (i ? config.weapons.secondaryRecoil : config.weapons.mainRecoil) * spray.recoil * profile.recoilScale;
      const kick = Math.exp(-Math.max(0, time - shotTime) / config.weapons.recoilRecoveryMs);
      const buildUp = firingSince < 0 || profile.effect === 'plasma' ? 0 : Math.min(1, (time - firingSince) / config.weapons.recoilBuildUpMs);
      heat[i] += (buildUp - heat[i]) * (1 - Math.exp(-delta / config.weapons.recoilRecoveryMs));
      gun.visible = modelReady[i] && holster < 1;
      gun.scale.setScalar(config.weapons.scale * profile.scale * (i ? .78 : 1));
      gun.position.set((i ? -1 : 1) * Math.min(placementWidth * .22, 310) * frameHeight / placementHeight, -frameHeight / 2 + .65, 0);
      if (!config.display.reducedMotion) {
        gun.position.x += px * config.weapons.sway;
        gun.position.y += Math.sin(time / 750) * config.weapons.bob - Math.sin(reloading * Math.PI) * 1.5;
        gun.position.z += kick * recoil;
      }
      gun.quaternion.setFromRotationMatrix(aimRotation.lookAt(gun.position, aimPoint, up));
      gun.rotateZ((i ? -.2 : .12) + side * spray.roll);
      if (!config.display.reducedMotion) {
        gun.rotateX(kick * recoil + heat[i] * config.weapons.maxRecoilTilt * spray.recoil);
        gun.rotateZ(heat[i] * config.weapons.maxRecoilTilt * spray.recoil * (i ? -1 : 1) + Math.sin(reloading * Math.PI) * (i ? 1 : -1));
      }
      // Both weapons fold inward around their grips while dropping below the HUD.
      // The shared spring keeps the current pose when the draw direction reverses.
      gun.position.x -= side * config.weapons.holsterInward * holster;
      gun.position.y -= config.weapons.holsterDrop * holster;
      gun.rotateY(side * config.weapons.holsterYaw * holster);
      gun.rotateX(-config.weapons.holsterPitch * holster);
      gun.rotateZ(-side * config.weapons.holsterRoll * holster);
      motions[i]?.update(time, delta, shotTime, firingSince >= 0, reloading, config.display.reducedMotion, charges[i], reload);
      handMotions[i]?.update(time, shotTime, config.display.reducedMotion);
      if (hands[i]) gloves?.setFiring(hands[i]!, profile.gloveGlowOnFire && firingSince >= 0 && holster < 1);
    });
    effects.update(time, delta, [mainShot, secondaryShot], [mainDrawn, secondaryDrawn], config.weapons.muzzleFlashMs, config.display.reducedMotion, aimPoint, [mainShotCharge, secondaryShotCharge], charges);
    gloves?.update(time, config.display.reducedMotion);
    renderer.render(scene, camera);
    rendered = true;
  };
  setPaused = value => {
    suspended = value || hidden;
    cancelFrame(raf);
    if (suspended) {
      releaseKeys();
      effects.clear();
      heat.fill(0);
      charges.fill(0);
      motions.forEach(motion => motion?.update(clock.now(), 0, -1, false, 0, true, 0));
      sprayPoses.forEach(pose => pose.reset());
      for (const hand of hands) if (hand) gloves?.setFiring(hand, false);
      gloves?.update(clock.now(), true);
      if (!rendered) render(clock.now());
      else renderer.render(scene, camera);
    } else { lastFrame = clock.now(); raf = nextFrame(time => render(clock.fromFrame(time))); }
  };
  updateGloves(config.gloves, config.display.reducedMotion);
  updateModels(mainModel || config.weapons.mainModel, secondaryModel || config.weapons.secondaryModel);
  setPaused(paused);
  return {
    update(patch) {
      const before = state;
      state = { ...state, ...patch };
      ({ config, paused, hidden, layout, mainModel, secondaryModel, mainDrawn, secondaryDrawn, mainHolster, secondaryHolster,
        mainShot, secondaryShot, mainShotCharge, secondaryShotCharge, mainFiringSince, secondaryFiringSince, reload, pointer } = state);
      if (patch.config) {
        updateGloves?.(config.gloves, config.display.reducedMotion);
        updateLighting?.(config.weapons.lighting, config.weapons.exposure);
        camera.fov = config.weapons.fov; camera.updateProjectionMatrix(); resize(options.size);
      }
      if (patch.config || before.mainModel !== mainModel || before.secondaryModel !== secondaryModel)
        updateModels?.(mainModel || config.weapons.mainModel, secondaryModel || config.weapons.secondaryModel);
      if (before.paused !== paused || before.hidden !== hidden) setPaused?.(paused);
      else if (suspended && !hidden && rendered) render(clock.now(), true);
    },
    resize,
    input(event) {
      if (event.type === 'blur') { releaseKeys(); effects.clear(); }
      else if (event.code) (event.type === 'keydown' ? keyDown : keyUp)({ code: event.code });
    },
    dispose() {
      disposed = true; cancelFrame(raf);
      removeHand(0); removeHand(1); gloves?.dispose();
      effects.dispose(); artwork.release(); lighting.dispose(); disposeWeapon(scene); disposeEnvironment(); renderer.dispose(); renderer.forceContextLoss();
    }
  };

}
