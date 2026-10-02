import * as THREE from 'three';
import type { WeaponLight, WeaponLighting } from './lighting-config';

/** A fixed light budget. Tuning only changes uniforms; no new shadow or render passes. */
export function createWeaponLighting(renderer: Pick<THREE.WebGLRenderer, 'toneMappingExposure'>, scene: THREE.Scene) {
  const ambient = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  const fill = new THREE.DirectionalLight();
  const rim = new THREE.DirectionalLight();
  scene.add(ambient, key, fill, rim);

  const direction = (light: THREE.DirectionalLight, value: WeaponLight) => {
    light.color.set(value.color);
    light.intensity = value.intensity;
    light.position.setFromSphericalCoords(10, THREE.MathUtils.degToRad(90 - value.elevation), THREE.MathUtils.degToRad(value.azimuth));
  };

  return {
    update(value: WeaponLighting, exposure: number) {
      renderer.toneMappingExposure = exposure;
      scene.environmentIntensity = value.environmentIntensity;
      scene.environmentRotation.set(0, THREE.MathUtils.degToRad(value.environmentRotation), 0);
      ambient.color.set(value.ambient.skyColor);
      ambient.groundColor.set(value.ambient.groundColor);
      ambient.intensity = value.ambient.intensity;
      direction(key, value.key);
      direction(fill, value.fill);
      direction(rim, value.rim);
    },
    dispose() {
      scene.remove(ambient, key, fill, rim);
      for (const light of [ambient, key, fill, rim]) light.dispose();
    }
  };
}
