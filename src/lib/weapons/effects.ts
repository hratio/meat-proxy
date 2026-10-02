import * as THREE from 'three';
import { createCasingGeometry } from './casing';
import type { WeaponEffects, WeaponProfile } from './profiles';
import { paintCanvas } from '../render/surface';
import { paintWeaponTexture, type WeaponTextureName } from './texture-art';
import type { WeaponTextureImages } from './textures';
import { prepareWeapon } from './prepare';

type Kind = 'flame' | 'smoke' | 'brass' | 'key' | 'disk' | 'sludge' | 'missile' | 'plasma' | 'energy';
type Keycap = { node: THREE.Object3D; visible: boolean; restoreAt: number; flight?: Particle };
type Particle = {
  kind: Kind;
  node: THREE.Object3D;
  material?: THREE.SpriteMaterial;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  born: number;
  life: number;
  size: number;
  gravity: number;
  trail: number;
  active: boolean;
  origin: THREE.Vector3;
  scale: THREE.Vector3;
  key?: Keycap;
  owner?: Mount;
};
type ChargeVisual = { root: THREE.Group; rotor: THREE.Group; core: THREE.Mesh; glow: THREE.Sprite; amount: number; angle: number; material: THREE.MeshBasicMaterial };
type Mount = { gun: THREE.Object3D; muzzle: THREE.Object3D; eject: THREE.Object3D; keys: Keycap[]; disk?: THREE.Object3D; profile: WeaponProfile; caseWidth: number; shots: number; last: number; charge?: ChargeVisual };

// One bounded effects pool shares the weapon renderer and its frame clock.
// Textures and geometry are baked once; changing models only replaces sockets.
export function createWeaponEffects(scene: THREE.Scene, camera: THREE.Camera, settings: () => WeaponEffects, images?: WeaponTextureImages) {
  const root = new THREE.Group();
  root.name = 'WeaponEffects';
  scene.add(root);
  const mounts: (Mount | undefined)[] = [];
  const pool: Particle[] = [];
  let preparation: Promise<boolean> | undefined;
  const textures: THREE.Texture[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const texture = (name: WeaponTextureName) => {
    let map: THREE.Texture;
    if (images) { map = new THREE.Texture(images[name]); map.flipY = false; map.needsUpdate = true; }
    else {
      const { element: canvas, context } = paintCanvas(settings().textureSize);
      paintWeaponTexture(name, context, canvas.width); map = new THREE.CanvasTexture(canvas);
    }
    map.colorSpace = THREE.SRGBColorSpace;
    textures.push(map); return map;
  };
  const flame = texture('flame');
  const smoke = texture('smoke');
  const halo = texture('halo');
  const brass = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.32 });
  const keyBody = new THREE.MeshStandardMaterial({ color: 0x3c474c, roughness: 0.55 });
  const slime = new THREE.MeshStandardMaterial({ color: 0x25b710, emissive: 0x168500, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0 });
  const missileBody = new THREE.MeshStandardMaterial({ color: 0x61684b, metalness: 0.4, roughness: 0.5 });
  const missileTip = new THREE.MeshStandardMaterial({ color: 0x202725, metalness: 0.65, roughness: 0.35 });
  const energyCore = new THREE.MeshBasicMaterial({ color: 0xd6ffbf, toneMapped: false });
  const energyShell = new THREE.MeshBasicMaterial({ color: 0x57ff18, transparent: true, opacity: .38, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  materials.push(brass, keyBody, slime, missileBody, missileTip, energyCore, energyShell);
  const casing = createCasingGeometry();
  const box = new THREE.BoxGeometry(0.85, 0.48, 0.85);
  const corners = box.attributes.position;
  for (let i = 0; i < corners.count; i++) if (corners.getY(i) > 0) { corners.setX(i, corners.getX(i) * 0.78); corners.setZ(i, corners.getZ(i) * 0.78); }
  box.computeVertexNormals();
  const sphere = new THREE.SphereGeometry(0.5, 10, 8);
  const tube = new THREE.CylinderGeometry(0.16, 0.16, 1.3, 8);
  const nose = new THREE.ConeGeometry(0.16, 0.45, 8);
  const fin = new THREE.BoxGeometry(0.85, 0.045, 0.45);
  const energySphere = new THREE.SphereGeometry(.5, 16, 12);
  const energyTail = new THREE.ConeGeometry(.45, 5, 12);
  energyTail.rotateX(Math.PI / 2); energyTail.translate(0, 0, 2.5);
  const chargeArc = new THREE.TorusGeometry(.118, .004, 6, 28, Math.PI * .48);
  geometries.push(casing, box, sphere, tube, nose, fin, energySphere, energyTail, chargeArc);
  const keyTops = ['W', 'A', 'S', 'D', 'F', 'Z'].map(letter => {
    const map = texture(`key-${letter}` as WeaponTextureName);
    const material = new THREE.MeshStandardMaterial({ map, roughness: 0.55 });
    materials.push(material); return material;
  });
  const lights = [0, 1].map(() => { const light = new THREE.PointLight(0xffba62, 0, 3); root.add(light); return light; });
  const point = new THREE.Vector3(), direction = new THREE.Vector3(), outward = new THREE.Vector3(), worldScale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const forward = new THREE.Vector3(0, 0, -1);
  let frameTime = 0;

  function make(kind: Kind): Particle {
    let node: THREE.Object3D;
    let material: THREE.SpriteMaterial | undefined;
    if (kind === 'flame' || kind === 'smoke' || kind === 'energy') {
      material = new THREE.SpriteMaterial({ map: kind === 'flame' ? flame : kind === 'energy' ? halo : smoke, color: kind === 'energy' ? 0x73ff28 : 0xffffff, transparent: true, depthWrite: false, blending: kind === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: kind !== 'energy' });
      const sprite = new THREE.Sprite(material);
      if (kind === 'flame') sprite.center.set(0.5, 0.08);
      node = sprite;
    } else if (kind === 'brass') node = new THREE.Mesh(casing, brass);
    else if (kind === 'key' || kind === 'disk') node = new THREE.Group();
    else if (kind === 'sludge') {
      node = new THREE.Group();
      node.add(new THREE.Mesh(sphere, slime));
      material = new THREE.SpriteMaterial({ map: halo, color: 0x82ff32, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const glow = new THREE.Sprite(material); glow.scale.setScalar(2.4); node.add(glow);
    } else if (kind === 'plasma') {
      node = new THREE.Group();
      const core = new THREE.Mesh(energySphere, energyCore); core.scale.set(.48, .48, 2.4);
      const shell = new THREE.Mesh(energySphere, energyShell); shell.scale.set(1, 1, 3);
      const tail = new THREE.Mesh(energyTail, energyShell);
      material = new THREE.SpriteMaterial({ map: halo, color: 0x61ff18, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const glow = new THREE.Sprite(material); glow.scale.setScalar(4);
      node.add(core, shell, tail, glow);
    } else {
      node = new THREE.Group();
      const body = new THREE.Mesh(tube, missileBody); body.rotation.x = Math.PI / 2;
      const tip = new THREE.Mesh(nose, missileTip); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.86;
      const wings = new THREE.Mesh(fin, missileBody); wings.position.z = 0.42;
      const vertical = wings.clone(); vertical.rotation.z = Math.PI / 2;
      material = new THREE.SpriteMaterial({ map: flame, color: 0xffb75c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const exhaust = new THREE.Sprite(material); exhaust.position.z = 0.85; exhaust.scale.setScalar(1.4);
      node.add(body, tip, wings, vertical, exhaust);
    }
    node.name = kind === 'key' ? 'KeycapProjectile' : `WeaponParticle_${kind}`;
    root.add(node);
    return { kind, node, material, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), origin: new THREE.Vector3(), scale: new THREE.Vector3(), born: 0, life: 0, size: 0, gravity: 0, trail: 0, active: false };
  }

  function restoreKey(key: Keycap) {
    key.node.visible = key.visible;
    key.flight = undefined;
  }

  function releaseKey(particle: Particle) {
    if (particle.key?.flight === particle) restoreKey(particle.key);
    particle.key = undefined;
    particle.owner = undefined;
    // Authored key meshes borrow their model's resources. Never dispose those here.
    if (particle.kind === 'key' || particle.kind === 'disk') particle.node.clear();
  }

  function unmount(slot: number) {
    const mount = mounts[slot];
    if (!mount) return;
    for (const particle of pool) if (particle.owner === mount) {
      releaseKey(particle); particle.active = false; particle.node.visible = false;
    }
    for (const key of mount.keys) if (key.flight) restoreKey(key);
    if (mount.charge) {
      mount.charge.root.removeFromParent();
      mount.charge.material.dispose(); mount.charge.glow.material.dispose();
    }
    mounts[slot] = undefined;
    lights[slot].intensity = 0;
  }

  function emit(kind: Kind, position: THREE.Vector3, velocity: THREE.Vector3, size: number, life: number, gravity = 0) {
    let particle = pool.find(item => !item.active && item.kind === kind);
    if (!particle) {
      if (pool.length >= settings().particleLimit) {
        const oldest = pool.reduce((a, b) => !a.active ? a : !b.active || b.born < a.born ? b : a);
        releaseKey(oldest);
        oldest.node.removeFromParent(); oldest.material?.dispose();
        pool.splice(pool.indexOf(oldest), 1);
      }
      particle = make(kind); pool.push(particle);
    }
    releaseKey(particle);
    Object.assign(particle, { active: true, born: frameTime, trail: frameTime, life, size, gravity });
    particle.node.visible = true; particle.node.position.copy(position); particle.node.quaternion.identity(); particle.node.scale.setScalar(size);
    particle.velocity.copy(velocity);
    particle.origin.copy(position); particle.scale.setScalar(size);
    particle.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(settings().tumbleSpeed);
    if (particle.material) { particle.material.opacity = 1; particle.material.rotation = Math.random() * Math.PI * 2; }
    return particle;
  }

  function trajectory(origin: THREE.Vector3, target: THREE.Vector3, gravity = 0, speedScale = 1) {
    const config = settings();
    const duration = Math.min(config.projectileMs / 1000, Math.max(.12, origin.distanceTo(target) / config.projectileSpeed)) / speedScale;
    const velocity = target.clone().sub(origin).divideScalar(duration);
    // Capture a ballistic path that reaches the aim point despite recoil and gravity.
    velocity.y += .5 * gravity * duration;
    return { velocity, life: duration * 1000 };
  }

  function screenBearing(origin: THREE.Vector3, heading: THREE.Vector3) {
    const base = origin.clone().project(camera), tip = origin.clone().add(heading).project(camera);
    const projection = camera.projectionMatrix.elements;
    // Sprites rotate in the camera plane. Undo projection scaling so widening
    // the canvas does not skew their angle away from the barrel.
    return Math.atan2((tip.y - base.y) / projection[5], (tip.x - base.x) / projection[0]);
  }

  function launchKey(mount: Mount, target: THREE.Vector3) {
    const config = settings();
    const available = mount.keys.filter(key => !key.flight && key.node.visible);
    const key = available[Math.floor(Math.random() * available.length)];
    // If every physical key is airborne, wait for one to return to the board.
    if (mount.keys.length && !key) return;
    worldScale.setScalar(config.debrisSize * 2.2);
    if (key) key.node.matrixWorld.decompose(point, rotation, worldScale);
    const path = trajectory(point, target, config.gravity);
    const particle = emit('key', point, path.velocity, 1, path.life, config.gravity);
    particle.owner = mount;
    particle.node.quaternion.copy(rotation);
    particle.scale.copy(worldScale); particle.node.scale.copy(worldScale);
    if (key) {
      const cap = key.node.clone(true);
      cap.position.set(0, 0, 0); cap.quaternion.identity(); cap.scale.setScalar(1); cap.visible = true;
      particle.node.add(cap);
      particle.key = key; key.flight = particle; key.restoreAt = frameTime + particle.life + 180;
      key.node.visible = false;
    } else {
      // Custom keyboards without named key nodes still fire forwards.
      const top = keyTops[Math.floor(Math.random() * keyTops.length)];
      particle.node.add(new THREE.Mesh(box, [keyBody, keyBody, top, keyBody, top, keyBody]));
    }
  }

  function fire(mount: Mount, aimPoint?: THREE.Vector3, charge = 0) {
    const config = settings(), profile = mount.profile;
    mount.muzzle.getWorldPosition(point); mount.muzzle.getWorldQuaternion(rotation);
    direction.copy(forward).applyQuaternion(rotation).normalize();
    const target = aimPoint || point.clone().addScaledVector(direction, config.projectileSpeed * config.projectileMs / 1000);
    const size = config.muzzleSize * profile.muzzleScale;
    mount.shots++;
    if (profile.effect === 'keycaps') {
      launchKey(mount, target);
    } else if (profile.effect === 'disks') {
      const path = trajectory(point, target, 0, 1.4);
      const disk = emit('disk', point, path.velocity, 1, path.life);
      disk.owner = mount;
      disk.node.quaternion.copy(rotation);
      if (mount.disk) {
        const media = mount.disk.clone(true);
        media.position.set(0, 0, 0); media.quaternion.identity(); media.scale.setScalar(1); media.visible = true;
        disk.node.add(media);
        mount.disk.getWorldScale(worldScale);
        disk.scale.set(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z));
      } else {
        // Custom models can use the disk profile without authored media.
        const media = new THREE.Mesh(box, keyBody); media.scale.set(1, .08, 1); disk.node.add(media);
        disk.scale.setScalar(config.debrisSize * 2);
      }
      disk.node.scale.copy(disk.scale);
      disk.spin.set(.6, (mount.shots % 2 ? 1 : -1) * 16, .35);
    } else if (profile.effect === 'plasma') {
      const strength = THREE.MathUtils.clamp(charge, 0, 1);
      const path = trajectory(point, target, 0, 2);
      const bolt = emit('plasma', point, path.velocity, size * .32 * (1 + strength * (profile.chargeSize - 1)), path.life);
      bolt.owner = mount;
      bolt.node.quaternion.setFromUnitVectors(forward, path.velocity.clone().normalize());
      bolt.node.children[0].scale.z = 2.4 - strength * 1.2;
      bolt.node.children[1].scale.z = 3 - strength * 1.5;
      bolt.material!.rotation = 0;
      emit('energy', point, new THREE.Vector3(), bolt.size * 3, 120);
    } else if (profile.effect === 'sludge') {
      for (let i = 0; i < config.sludgeDrops; i++) {
        const gravity = config.gravity * 0.25;
        const path = trajectory(point, target, gravity, i ? 1 + Math.random() * 0.4 : 1);
        const glob = emit('sludge', point, path.velocity, size * (i ? 0.14 + Math.random() * 0.18 : 0.6), path.life, gravity);
        glob.node.quaternion.setFromUnitVectors(forward, path.velocity.clone().normalize()); glob.node.scale.z *= 1.6;
      }
    } else if (profile.effect === 'missiles') {
      outward.set(mount.shots % 2 ? 1 : -1, 0, 0).applyQuaternion(rotation);
      point.addScaledVector(outward, config.missilePodOffset);
      const path = trajectory(point, target);
      direction.copy(path.velocity).normalize();
      const missile = emit('missile', point, path.velocity, size * 0.34, path.life);
      missile.node.quaternion.setFromUnitVectors(forward, direction);
      missile.material!.rotation = screenBearing(point, direction) + Math.PI / 2;
    } else {
      const bearing = screenBearing(point, direction) - Math.PI / 2;
      for (let i = 0; i < config.plumeCount; i++) {
        const plume = emit('flame', point, direction.clone().multiplyScalar(0.15), size * (i ? 0.55 : 1), config.plumeMs * (1 - i * 0.08));
        plume.material!.color.set(0xffffff);
        plume.material!.rotation = bearing + (i - (config.plumeCount - 1) / 2) * 0.27;
        plume.node.scale.set(plume.size * 0.85, plume.size * 1.8, 1);
      }
      if (mount.shots % 3 === 0) emit('smoke', point, direction.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, 0.3, 0)), size * 0.5, config.smokeMs);
    }
    if (profile.effect === 'ballistic' || profile.effect === 'canisters') {
      mount.eject.getWorldPosition(point);
      mount.gun.getWorldQuaternion(rotation);
      outward.set(mount.gun.position.x < 0 ? -1 : 1, 0, 0.3).applyQuaternion(rotation).multiplyScalar(config.ejectSpeed);
      outward.y += config.ejectLift;
      mount.gun.getWorldScale(worldScale);
      const caseScale = profile.effect === 'canisters' ? .18 * worldScale.x : mount.caseWidth === 1.35 ? 1.15 : .7;
      const caseSize = config.debrisSize * caseScale;
      const particle = emit('brass', point, outward, caseSize, config.debrisMs, config.gravity * 4);
      particle.scale.set(caseSize * mount.caseWidth, caseSize, caseSize * mount.caseWidth);
      particle.node.scale.copy(particle.scale);
    }
  }

  return {
    prepare(renderer: THREE.WebGLRenderer, current: () => boolean) {
      return preparation ??= (async () => {
        // Retain one reusable particle per shader family. Disposing a temporary
        // material here would discard its program and move the hitch to firing.
        for (const kind of ['flame', 'smoke', 'brass', 'sludge', 'missile', 'plasma', 'energy'] as Kind[]) {
          const particle = make(kind); particle.node.visible = false; pool.push(particle);
        }
        const keys = make('key'); keys.node.visible = false; pool.push(keys);
        const lettering = new THREE.Group(); lettering.visible = false; root.add(lettering);
        for (const top of keyTops) lettering.add(new THREE.Mesh(box, [keyBody, keyBody, top, keyBody, top, keyBody]));
        try { return await prepareWeapon(renderer, scene, camera, root, current); }
        // Keep the materials/textures alive, but never add preparation geometry
        // to a pooled particle that can later be fired.
        finally { lettering.removeFromParent(); }
      })();
    },
    unmount,
    mount(slot: number, gun: THREE.Object3D, model: THREE.Object3D | undefined, profile: WeaponProfile) {
      unmount(slot);
      const keys: Keycap[] = [];
      model?.traverse(node => { if (typeof node.userData.keyCode === 'string') keys.push({ node, visible: node.visible, restoreAt: 0 }); });
      const assetId = model?.getObjectByName('Weapon')?.userData.assetId;
      const caseWidth = assetId === 'auto-bmg' || assetId === 'flaky-assertions' ? 1.35 : profile.effect === 'canisters' || ['rhein-9', 'stack-10', 'ak-256', 'elastic-saw'].includes(assetId) ? .7 : 1;
      const mount: Mount = { gun, muzzle: model?.getObjectByName('Muzzle') || gun, eject: model?.getObjectByName('Eject') || gun, keys, disk: model?.getObjectByName('ChamberDisk'), profile, caseWidth, shots: 0, last: frameTime };
      if (profile.effect === 'plasma') {
        const chargeRoot = new THREE.Group(); chargeRoot.name = 'WeaponCharge'; chargeRoot.visible = false;
        const rotor = new THREE.Group(); rotor.name = 'ChargeRotor';
        const material = new THREE.MeshBasicMaterial({ color: 0x68ff27, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
        for (let i = 0; i < 3; i++) {
          const arc = new THREE.Mesh(chargeArc, material); arc.rotation.z = i * Math.PI * 2 / 3; rotor.add(arc);
        }
        const core = new THREE.Mesh(energySphere, energyCore);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: 0x63ff19, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        chargeRoot.add(rotor, core, glow); mount.muzzle.add(chargeRoot);
        chargeRoot.position.z = -.005;
        mount.charge = { root: chargeRoot, rotor, core, glow, material, amount: 0, angle: 0 };
      }
      mounts[slot] = mount;
    },
    update(time: number, delta: number, shots: number[], drawn: boolean[], flashMs: number, reduced: boolean, aimPoint?: THREE.Vector3, shotCharges: number[] = [], charges: number[] = []) {
      frameTime = time;
      const config = settings();
      if (!config.enabled || reduced) { this.clear(); return; }
      for (let slot = 0; slot < mounts.length; slot++) {
        const mount = mounts[slot];
        if (!mount) continue;
        for (const key of mount.keys) if (key.flight && time >= key.restoreAt) restoreKey(key);
        mount.gun.updateWorldMatrix(true, true);
        // A released plasma shot must survive a slow frame/initial GPU upload,
        // even when the much shorter muzzle-flash interval has already elapsed.
        const shotWindow = mount.profile.effect === 'plasma' || mount.profile.effect === 'disks' ? Math.max(1000, config.projectileMs) : config.plumeMs;
        if (drawn[slot] && shots[slot] > mount.last && time - shots[slot] < shotWindow) fire(mount, aimPoint, shotCharges[slot] ?? 0);
        mount.last = shots[slot];
        if (mount.charge) {
          const visual = mount.charge, target = drawn[slot] ? (charges[slot] ?? 0) : 0;
          visual.amount += (target - visual.amount) * (1 - Math.exp(-delta / 65));
          visual.root.visible = visual.amount > .002;
          visual.angle = (visual.angle + Math.min(delta, 100) / 1000 * (4 + visual.amount * 24)) % (Math.PI * 2);
          visual.rotor.rotation.z = visual.angle;
          visual.material.opacity = Math.min(1, visual.amount * 3);
          visual.core.scale.setScalar(.025 + visual.amount * .11);
          visual.glow.scale.setScalar(.14 + visual.amount * .26);
          visual.glow.material.opacity = visual.amount * .8;
        }
        const light = lights[slot];
        light.color.set(mount.profile.effect === 'sludge' || mount.profile.effect === 'plasma' ? 0x84ff32 : mount.profile.effect === 'keycaps' || mount.profile.effect === 'disks' ? 0x84e5ff : 0xffb66a);
        mount.muzzle.getWorldPosition(light.position);
        light.intensity = drawn[slot] ? config.muzzleLight * (Math.max(0, 1 - (time - shots[slot]) / flashMs) * (1 + (shotCharges[slot] ?? 0) * 2) + (mount.charge?.amount ?? 0) * .7) : 0;
      }
      const seconds = Math.min(delta, 100) / 1000;
      // Emitted missile smoke may reuse expired slots; iterate a stable frame list.
      for (const particle of pool.slice()) {
        if (!particle.active) continue;
        const age = (time - particle.born) / particle.life;
        if (age >= 1) {
          particle.active = false; particle.node.visible = false;
          if (particle.kind === 'plasma' && age < 2) {
            const impact = particle.origin.clone().addScaledVector(particle.velocity, particle.life / 1000);
            emit('energy', impact, new THREE.Vector3(), particle.size * 4, 180);
          }
          continue;
        }
        if (particle.kind === 'key' || particle.kind === 'disk' || particle.kind === 'missile' || particle.kind === 'sludge' || particle.kind === 'brass' || particle.kind === 'plasma') {
          const flight = (time - particle.born) / 1000;
          particle.node.position.copy(particle.origin).addScaledVector(particle.velocity, flight);
          particle.node.position.y -= .5 * particle.gravity * flight * flight;
        } else {
          particle.velocity.y -= particle.gravity * seconds;
          particle.node.position.addScaledVector(particle.velocity, seconds);
        }
        if (particle.kind === 'key' || particle.kind === 'disk' || particle.kind === 'brass') {
          particle.node.rotation.x += particle.spin.x * seconds;
          particle.node.rotation.y += particle.spin.y * seconds;
          particle.node.rotation.z += particle.spin.z * seconds;
          particle.node.scale.copy(particle.scale).multiplyScalar(Math.min(1, (1 - age) * (particle.kind === 'brass' ? 5 : 12)));
        } else if (particle.kind === 'missile') {
          if (time - particle.trail >= config.missileTrailMs) {
            particle.trail = time;
            emit('smoke', particle.node.position, new THREE.Vector3(0, 0.12, 0), particle.size * 1.1, config.smokeMs);
          }
        } else if (particle.kind === 'plasma') {
          particle.material!.opacity = 1 - age * .45;
        } else {
          const grow = particle.kind === 'flame' ? 1 + age * 0.7 : particle.kind === 'smoke' || particle.kind === 'energy' ? 1 + age * 2 : 1 - age * 0.5;
          particle.node.scale.setScalar(particle.size * grow);
          if (particle.material) particle.material.opacity = (1 - age) ** (particle.kind === 'flame' ? 1.5 : 0.7);
          if (particle.kind === 'sludge') particle.node.scale.z *= 1.6;
          if (particle.kind === 'flame') { particle.node.scale.x *= 0.85; particle.node.scale.y *= 1.8; }
        }
      }
    },
    clear() {
      for (const particle of pool) { releaseKey(particle); particle.active = false; particle.node.visible = false; }
      for (const light of lights) light.intensity = 0;
      for (const mount of mounts) if (mount?.charge) { mount.charge.amount = 0; mount.charge.root.visible = false; }
    },
    dispose() {
      this.clear();
      for (let slot = 0; slot < mounts.length; slot++) unmount(slot);
      mounts.length = 0;
      root.removeFromParent();
      for (const particle of pool) particle.material?.dispose();
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const map of textures) map.dispose();
      pool.length = 0;
    }
  };
}
