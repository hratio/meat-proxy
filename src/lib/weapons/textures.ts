import { assetUrl } from '../asset-url';
import { weaponTextureNames, type WeaponTextureName } from './texture-art';

export type WeaponTextureImages = Record<WeaponTextureName, ImageBitmap>;
const cache = new Map<number, { users: number; source: Promise<WeaponTextureImages> }>();

export async function loadWeaponTextures(size: number) {
  if (![32, 64, 128, 256, 512].includes(size)) return { images: undefined, release() {} };
  let entry = cache.get(size);
  if (!entry) {
    const source = (async () => {
      const response = await fetch(assetUrl(`/textures/weapons/effects-${size}.webp`));
      if (!response.ok) throw new Error('Weapon effect artwork unavailable');
      const atlas = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none' });
      const images = {} as WeaponTextureImages;
      try {
        for (let index = 0; index < weaponTextureNames.length; index++) {
          images[weaponTextureNames[index]] = await createImageBitmap(atlas, index % 3 * size, Math.floor(index / 3) * size, size, size,
            { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
        }
        return images;
      } catch (error) { for (const bitmap of Object.values(images)) bitmap.close(); throw error; }
      finally { atlas.close(); }
    })();
    entry = { source, users: 0 }; cache.set(size, entry);
  }
  const owned = entry; owned.users++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (--owned.users === 0) {
      if (cache.get(size) === owned) cache.delete(size);
      void owned.source.then(images => { for (const image of Object.values(images)) image.close(); }, () => {});
    }
  };
  try { return { images: await owned.source, release }; }
  // Preserve rendering if artwork is unavailable; the same painter runs in the worker.
  catch { release(); return { images: undefined, release() {} }; }
}
