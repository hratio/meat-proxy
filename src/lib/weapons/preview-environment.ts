import { assetUrl } from '../asset-url';
import * as THREE from 'three';

let source: Promise<ArrayBuffer> | undefined;

/** Share the baked lighting data; each viewer still owns its GPU texture. */
export async function loadPreviewEnvironment() {
  source ??= fetch(assetUrl('/models/weapons/inspection-environment.bin')).then(async response => {
    if (!response.ok) throw new Error('Inspection lighting unavailable');
    const bytes = await response.arrayBuffer();
    const header = new DataView(bytes);
    if (bytes.byteLength < 12 || header.getUint32(0) !== 0x50524445) throw new Error('Invalid inspection lighting');
    const width = header.getUint32(4, true), height = header.getUint32(8, true);
    if (!width || !height || bytes.byteLength !== 12 + width * height * 8) throw new Error('Incomplete inspection lighting');
    return bytes;
  }).catch(error => { source = undefined; throw error; });

  const bytes = await source;
  const header = new DataView(bytes);
  const texture = new THREE.DataTexture(
    new Uint16Array(bytes, 12), header.getUint32(4, true), header.getUint32(8, true),
    THREE.RGBAFormat, THREE.HalfFloatType
  );
  texture.mapping = THREE.CubeUVReflectionMapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
