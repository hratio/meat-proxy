import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createWeaponMotion } from './runtime';
import { weaponProfiles } from './profiles';
import { recordedSounds } from './samples';

function fixture(previousShot = -1, getProfile?: () => { barrelRecoilScale: number }) {
  const model = new THREE.Group(), weapon = new THREE.Group();
  weapon.name = 'Weapon'; weapon.userData.assetId = 'flaky-assertions'; model.add(weapon);
  const barrels = Array.from({ length: 4 }, (_, i) => {
    const barrel = new THREE.Group(); barrel.name = `Barrel${i}`;
    barrel.position.set(i % 2 ? .19 : -.19, i < 2 ? .52 : .20, 0);
    for (const name of ['Muzzle', 'Eject']) {
      const socket = new THREE.Object3D(); socket.name = `${name}${i}`;
      socket.position.set(name === 'Eject' ? .08 : 0, 0, name === 'Muzzle' ? -1.42 : .25);
      barrel.add(socket);
    }
    weapon.add(barrel); return barrel;
  });
  for (const name of ['Muzzle', 'Eject']) { const node = new THREE.Object3D(); node.name = name; weapon.add(node); }
  return { model, barrels, motion: createWeaponMotion(model, previousShot, getProfile) };
}

describe('Flaky Assertions firing', () => {
  it('uses the MK46 preset cadence and high recoil', () => {
    const profile = weaponProfiles['flaky-assertions'];
    expect(profile.fireIntervalMs).toBe(recordedSounds.mk46.fireIntervalMs);
    expect(profile.sound.shot).toBe(recordedSounds.mk46.sound!.shot);
    expect(profile.sound.loop).toBe(recordedSounds.mk46.sound!.loop);
    expect(profile.recoilScale).toBeGreaterThan(2);
    expect(profile.sprayRoll).toBe(false);
  });
  it('recoils one alternating barrel per actual shot, with matching muzzle and eject sockets', () => {
    const { model, barrels, motion } = fixture();
    // Parent scale, rotation and a mirrored left-hand slot must not move flashes
    // away from the selected barrel tip.
    model.scale.set(-2, 2, 2); model.rotation.y = .4; model.position.set(3, -2, 1);
    for (const [step, barrelIndex] of [0, 3, 1, 2, 0].entries()) {
      const shot = 1000 + step * 290;
      motion.update(shot, 16, shot, true, 0, false);
      expect(barrels.map(b => b.position.z)).toEqual(barrels.map((_, i) => i === barrelIndex ? .145 : 0));
      for (const name of ['Muzzle', 'Eject']) {
        const actual = model.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
        const expected = model.getObjectByName(`${name}${barrelIndex}`)!.getWorldPosition(new THREE.Vector3());
        expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
      }
      motion.update(shot + 100, 100, shot, true, 0, false);
      expect(barrels[barrelIndex].position.z).toBeGreaterThan(0);
      expect(barrels[barrelIndex].position.z).toBeLessThan(.145);
      motion.update(shot + 230, 100, shot, false, 0, false);
      expect(barrels.every(b => b.position.z === 0)).toBe(true);
    }
  });
  it('does not animate an old shot on mount or create shots just from holding the trigger', () => {
    const { barrels, motion } = fixture(1000);
    motion.update(1001, 16, 1000, true, 0, false);
    motion.update(1500, 100, 1000, true, 0, false);
    expect(barrels.every(b => b.position.z === 0)).toBe(true);
  });
  it('scales barrel travel by 50% without changing return timing or barrel size', () => {
    const original = fixture();
    const extended = fixture(-1, () => ({ barrelRecoilScale: 1.5 }));
    for (const time of [1000, 1050, 1120, 1230]) {
      original.motion.update(time, 16, 1000, true, 0, false);
      extended.motion.update(time, 16, 1000, true, 0, false);
      expect(extended.barrels[0].position.z).toBeCloseTo(original.barrels[0].position.z * 1.5);
      expect(extended.barrels.slice(1).every(b => b.position.z === 0)).toBe(true);
      expect(extended.barrels[0].scale.toArray()).toEqual([1, 1, 1]);
      const tip = extended.model.getObjectByName('Muzzle0')!.getWorldPosition(new THREE.Vector3());
      expect(extended.model.getObjectByName('Muzzle')!.getWorldPosition(new THREE.Vector3()).distanceTo(tip)).toBeLessThan(1e-6);
    }
    expect(extended.barrels[0].position.z).toBe(0);
  });
  it('reads live profile changes, including disabling travel, without restarting the barrel sequence', () => {
    let profile = { barrelRecoilScale: 1.5 };
    const { model, barrels, motion } = fixture(-1, () => profile);
    motion.update(1000, 16, 1000, true, 0, false);
    expect(barrels[0].position.z).toBeCloseTo(.2175);
    profile = { barrelRecoilScale: 0 };
    motion.update(1290, 16, 1290, true, 0, false);
    expect(barrels.every(b => b.position.z === 0)).toBe(true);
    expect(model.getObjectByName('Muzzle')!.position.x).toBe(barrels[3].position.x);
    profile = { barrelRecoilScale: 2 };
    motion.update(1580, 16, 1580, true, 0, false);
    expect(barrels[1].position.z).toBeCloseTo(.29);
    motion.update(1581, 1, 1580, true, 0, true);
    expect(barrels.every(b => b.position.z === 0)).toBe(true);
  });
  it('keeps barrels at rest for reduced motion while still choosing the firing muzzle', () => {
    const { model, barrels, motion } = fixture();
    motion.update(1000, 16, 1000, true, 0, true);
    motion.update(1290, 16, 1290, true, 0, true);
    expect(barrels.every(b => b.position.z === 0)).toBe(true);
    expect(model.getObjectByName('Muzzle')!.position.x).toBe(barrels[3].position.x);
  });
});
