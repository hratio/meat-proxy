import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGFormat, RepeatWrapping, type BufferGeometry, type Texture } from 'three';
import { bakeCrownDisplayMask } from './crown-display-mask.mjs';

/** Paint the authored glyphs and halo on the LCD itself. One surface avoids
 * coplanar depth fighting, especially with the car camera's short near plane. */
export function createCrownDisplay(geometry: BufferGeometry, surface: BufferGeometry, baked?: Texture) {
  if (baked) {
    // The GLB carries lossless core/glow channels, not a color image. A clone
    // belongs to this scene instance; the source material keeps its own texture.
    const texture = baked.clone();
    texture.colorSpace = NoColorSpace; texture.flipY = false;
    texture.wrapS = RepeatWrapping; texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true;
    return texture;
  }
  const { data, width, height } = bakeCrownDisplayMask(geometry);
  const texture = new DataTexture(data, width, height, RGFormat);
  texture.wrapS = RepeatWrapping; texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter;
  texture.generateMipmaps=true;
  texture.needsUpdate = true;

  // Keep the source GLB and its editable lettering intact. Only the runtime
  // clone omits the old glyph triangles; their exact shapes are now in the mask.
  const indices:number[]=[],surfaceIndex=surface.index,surfaceRole=surface.getAttribute('uv');
  const surfaceCount=surfaceIndex?.count??surface.getAttribute('position').count;
  for(let i=0;i<surfaceCount;i+=3){
    const a=surfaceIndex?surfaceIndex.getX(i):i;
    if(Math.round((1-surfaceRole.getY(a))*8)===11)continue;
    indices.push(a,surfaceIndex?surfaceIndex.getX(i+1):i+1,surfaceIndex?surfaceIndex.getX(i+2):i+2);
  }
  surface.setIndex(indices);
  return texture;
}
