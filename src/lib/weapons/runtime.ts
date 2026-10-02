import * as THREE from 'three';
import { loadPreviewEnvironment } from './preview-environment';
import { createFlakMotion } from './flak-motion';
import type { WeaponProfile } from './profiles';

/** Reuse the baked neutral room without running the PMREM pipeline at startup. */
export function lightWeaponScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  let disposed = false, environment: THREE.Texture | undefined;
  scene.environmentIntensity = .8;
  const ready = loadPreviewEnvironment().then(texture => {
    if (disposed) { texture.dispose(); return; }
    environment = texture; scene.environment = texture; renderer.initTexture(texture);
  });
  // Existing preview consumers can render while loading; arena preparation awaits ready.
  void ready.catch(error => console.warn('Reflection environment unavailable', error));
  return Object.assign(() => { disposed = true; scene.environment = null; environment?.dispose(); }, { ready });
}

export function disposeWeapon(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  const bitmaps = new Set<ImageBitmap>();
  textures.forEach(value => {
    if (typeof ImageBitmap !== 'undefined' && value.image instanceof ImageBitmap) bitmaps.add(value.image);
    value.dispose();
  });
  bitmaps.forEach(bitmap => bitmap.close());
  materials.forEach(value => value.dispose());
  geometries.forEach(value => value.dispose());
}

/** Centers the exported metre-scale asset inside a two-unit display envelope. */
export function frameWeapon(model: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const root = new THREE.Group();
  model.position.sub(bounds.getCenter(new THREE.Vector3()));
  root.add(model);
  root.scale.setScalar(2 / Math.max(size.x, size.y, size.z));
  return root;
}

/** Preserve relative weapon sizes in the arena; previews frame models individually. */
export function frameHeldWeapon(model: THREE.Object3D) {
  const root = frameWeapon(model);
  const weapon = model.getObjectByName('Weapon');
  if (weapon?.userData.originalAsset && weapon.userData.units === 'metres') root.scale.setScalar(2);
  return root;
}

/** Show the detailed side in the primary slot; sockets and moving parts follow. */
export function applyWeaponSlotPose(root: THREE.Object3D, url: string, slot: number, yaw = 0) {
  const id = url.split('/').pop()?.replace(/\.glb(?:[?#].*)?$/i, '') || '';
  const keyboard = id === 'daz-ratatat';
  const aircraft = id === 'brrrt-10' || id === 'heavenfire-67';
  const primary = slot === 0;
  const nativeRight = root.getObjectByName('Weapon')?.userData.primaryHand === 'right';
  root.rotation.y = yaw + (primary && keyboard ? Math.PI : 0);
  // New gun exports are authored for the right hand; mirror their left-slot copy.
  // Older/custom assets retain the previous primary-slot correction.
  const mirror = !keyboard && !aircraft && (nativeRight ? !primary : primary);
  root.scale.x = Math.abs(root.scale.x) * (mirror ? -1 : 1);
}

/** Mechanical motion uses authored pivots; glTF remains usable without this helper. */
export function createWeaponMotion(model: THREE.Object3D, previousShot = -1, getProfile?: () => Pick<WeaponProfile, 'barrelRecoilScale'>) {
  const assetId = model.getObjectByName('Weapon')?.userData.assetId;
  const parity = model.getObjectByName('Weapon')?.userData.animationParity === -1 ? -1 : 1;
  const flak = assetId === 'flaky-assertions' ? createFlakMotion(model, previousShot) : undefined;
  const names = ['Trigger', 'Hammer', 'Cylinder', 'Bolt', 'Magazine', 'BreakAction', 'Rotor', 'TailRotor', 'BarrelCluster', 'Core', 'PullCordL', 'PullCordR', 'FeedDiskL', 'FeedDiskR'];
  const parts = new Map(names.flatMap(name => {
    const node = model.getObjectByName(name);
    return node ? [[name, { node, position: node.position.clone(), rotation: node.quaternion.clone() }] as const] : [];
  }));
  const keys = new Map<string, { node: THREE.Object3D; rest: number; until: number; held: boolean }>();
  const coreMaterials = new Map<THREE.MeshStandardMaterial, { intensity: number; color: THREE.Color }>();
  const chargedColor = new THREE.Color().setRGB(1, .035, .055);
  model.traverse(node => {
    if (typeof node.userData.keyCode === 'string') keys.set(node.userData.keyCode, { node, rest: node.position.y, until: 0, held: false });
    if (parts.has('Core') && node instanceof THREE.Mesh) {
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material instanceof THREE.MeshStandardMaterial && material.name === 'Arsenal / signal') coreMaterials.set(material, { intensity: material.emissiveIntensity, color: material.emissive.clone() });
      }
    }
  });
  const axisX = new THREE.Vector3(1, 0, 0), axisY = new THREE.Vector3(0, 1, 0), axisZ = new THREE.Vector3(0, 0, 1);
  const turn = new THREE.Quaternion();
  let lastShot = previousShot, cylinderAngle = 0, rotaryAngle = 0, rotorAngle = 0, rotarySpeed = 1.5;
  const disks: { node: THREE.Object3D; rest: THREE.Vector3; side: string; index: number }[] = [];
  model.traverse(node => {
    const match = /^Disk_([LR])_(\d+)$/.exec(node.name);
    if (match) disks.push({ node, rest: node.position.clone(), side: match[1], index: Number(match[2]) });
  });
  const chamber = model.getObjectByName('ChamberDisk');
  const chamberRest = chamber?.position.clone();
  let diskShots = 0, refillAt = 0, wasReloading = false, lastReload = 0;
  function rotate(name: string, axis: THREE.Vector3, angle: number) {
    const part = parts.get(name);
    if (part) part.node.quaternion.copy(turn.setFromAxisAngle(axis, angle)).multiply(part.rotation);
  }
  return {
    keyDown(code: string, time: number) { const key = keys.get(code); if (key) { key.held = true; key.until = time + 100; } },
    keyUp(code: string) { const key = keys.get(code); if (key) key.held = false; },
    releaseKeys() { for (const key of keys.values()) key.held = false; },
    update(time: number, deltaMs: number, shot: number, firing: boolean, reload: number, reducedMotion: boolean, charge = 0, reloadId = 0) {
      flak?.update(time, shot, reducedMotion, getProfile?.().barrelRecoilScale ?? 1);
      const freshShot = shot > 0 && shot !== lastShot;
      const freshReload = reloadId > 0 && reloadId !== lastReload;
      lastReload = reloadId;
      // Magazine state is cosmetic, like keyboard ammunition. Refill an empty
      // pair automatically; the game's explicit reload also restores both.
      if (disks.length && (freshReload || (reload > 0 && !wasReloading) || (refillAt > 0 && time >= refillAt))) {
        diskShots = 0; refillAt = 0;
      }
      wasReloading = reload > 0;
      if (freshShot) {
        lastShot = shot;
        cylinderAngle += Math.PI / 3;
        if (disks.length && diskShots < disks.length) {
          diskShots++;
          if (diskShots === disks.length) refillAt = time + 650;
        }
        if (keys.size) {
          const sequence = ['KeyR', 'KeyE', 'KeyV', 'KeyI', 'KeyE', 'KeyW'];
          const key = keys.get(sequence[Math.floor(shot / 100) % sequence.length]);
          if (key) key.until = time + 140;
          const space = keys.get('Space'); if (space) space.until = time + 120;
        }
      }
      const kick = reducedMotion || shot <= 0 ? 0 : Math.exp(-Math.max(0, time - shot) / 80);
      const reloadPose = reducedMotion ? 0 : Math.sin(Math.PI * THREE.MathUtils.clamp(reload, 0, 1));
      rotate('Trigger', axisX, -kick * .23);
      rotate('Hammer', axisX, kick * .5);
      rotate('Cylinder', axisZ, reducedMotion ? 0 : cylinderAngle * parity);
      rotate('BreakAction', axisX, reloadPose * .6);
      for (const name of ['Magazine', 'Bolt']) {
        const part = parts.get(name);
        if (part) {
          part.node.position.copy(part.position);
          if (name === 'Magazine') part.node.position.y -= reloadPose * .16;
          else if (assetId === 'auto-bmg') {
            // Lift, withdraw, return, lock. The full cycle fits the 800 ms shot.
            const age = reducedMotion || shot <= 0 ? 1 : THREE.MathUtils.clamp((time - shot) / 720, 0, 1);
            const lift = age < .16 ? age / .16 : age < .76 ? 1 : (1 - age) / .24;
            const travel = age < .16 ? 0 : age < .44 ? (age - .16) / .28 : age < .60 ? 1 : age < .82 ? (.82 - age) / .22 : 0;
            rotate('Bolt', axisZ, lift * .85 * parity);
            part.node.position.z += Math.max(0, travel) * .13;
          } else part.node.position.z += kick * .033;
        }
      }
      for (const disk of disks) {
        const used = disk.side === 'L' ? Math.ceil(diskShots / 2) : Math.floor(diskShots / 2);
        disk.node.visible = disk.index >= used;
        disk.node.position.copy(disk.rest);
        // Remaining disks slide down their diagonal glass feed, leaving an
        // unmistakably empty section at the top of each magazine.
        const inward = Math.min(used, disk.index) * .022 / Math.SQRT2;
        disk.node.position.x -= Math.sign(disk.rest.x) * inward;
        disk.node.position.y -= inward;
      }
      if (chamber && chamberRest) {
        const age = time - shot;
        chamber.position.copy(chamberRest);
        chamber.visible = !refillAt;
        if (!reducedMotion && shot > 0 && age >= 0 && age < 100) chamber.position.z -= .70 * age / 100;
      }
      for (const [i, side] of ['L', 'R'].entries()) {
        // Cords stand out from the lids. A small swing about the barrel axis
        // keeps the entire loop outside each magazine throughout recoil.
        const flutter = reducedMotion ? 0 : Math.sin((time - shot) / 65 + i) * kick * .18;
        rotate('PullCord' + side, axisZ, flutter);
        const feed = parts.get('FeedDisk' + side);
        if (feed) {
          const progress = !reducedMotion && shot > 0 && diskShots % 2 === (i ? 0 : 1) ? THREE.MathUtils.clamp((time - shot) / 100, 0, 1) : 0;
          feed.node.position.copy(feed.position);
          feed.node.visible = !refillAt;
          // Pickup rollers turn each diagonal disk flat before handing it to
          // the central barrel. The next magazine disk replaces it each cycle.
          if (progress < 1) {
            feed.node.position.x *= 1 - progress;
            feed.node.position.y = THREE.MathUtils.lerp(feed.position.y, .043, progress);
            feed.node.position.z = THREE.MathUtils.lerp(feed.position.z, -.20, progress);
          }
          rotate('FeedDisk' + side, axisZ, progress < 1 ? Math.sign(feed.position.x) * progress * Math.PI / 4 : 0);
        }
      }
      if (!reducedMotion) {
        const dt = Math.min(deltaMs, 100) / 1000;
        rotorAngle += dt * (firing ? 22 : 6);
        const targetSpeed = firing ? 32 : 1.5 + kick * 18;
        rotarySpeed += (targetSpeed - rotarySpeed) * (1 - Math.exp(-dt / (firing ? .16 : .55)));
        rotaryAngle = (rotaryAngle + dt * rotarySpeed) % (Math.PI * 2);
      }
      rotate('Rotor', axisY, rotorAngle);
      rotate('TailRotor', axisX, rotorAngle * 2);
      rotate('BarrelCluster', axisZ, rotaryAngle);
      const core = parts.get('Core');
      if (core) core.node.scale.setScalar(reducedMotion ? 1 : 1 + kick * .08 + charge * .06);
      for (const [material, rest] of coreMaterials) {
        material.emissive.copy(rest.color).lerp(chargedColor, charge);
        material.emissiveIntensity = rest.intensity * (1 + charge * 2 + kick * 2);
      }
      for (const key of keys.values()) key.node.position.y = key.rest - (!reducedMotion && (key.held || time < key.until) ? .009 : 0);
    }
  };
}

export type WeaponMotion = ReturnType<typeof createWeaponMotion>;
