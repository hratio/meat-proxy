import * as THREE from 'three';

/** A small spent-case mesh, shared by every brass particle. Y is its long axis. */
export function createCasingGeometry() {
  const brass = 0xc9a353, lip = 0xe5c77e, groove = 0x72552b;
  const primer = 0xa39b82, inside = 0x66502f;
  // Trace the solid underside, rim, outer wall, open mouth and inner wall back
  // to the cavity floor. Keep the original particle's 1.6-unit overall length.
  const profile: [number, number, number][] = [
    [0, -.75, groove], [.05, -.755, primer], [.10, -.77, primer],
    [.14, -.77, primer], [.155, -.80, groove], [.18, -.80, brass],
    [.36, -.80, brass], [.38, -.77, lip], [.38, -.68, brass],
    [.35, -.65, brass], [.29, -.64, groove], [.29, -.55, groove],
    [.34, -.51, brass], [.345, -.40, brass], [.325, .71, brass],
    [.32, .785, lip], [.305, .80, lip], [.27, .80, lip],
    [.255, .77, inside], [.27, -.42, inside], [.24, -.55, inside],
    [0, -.55, inside]
  ];
  const geometry = new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), 16);
  geometry.name = 'SpentCasing';
  // Color the recessed surfaces without extra materials, textures or draw calls.
  const colors: number[] = [], color = new THREE.Color();
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    color.setHex(profile[i % profile.length][2]);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}
