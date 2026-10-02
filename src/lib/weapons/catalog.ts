import manifest from './manifest.json';

export const weaponCatalog = manifest.weapons;
export type WeaponAsset = typeof weaponCatalog[number];
export type WeaponReference = number | string;
export type WeaponOption = { value: string; label: string };
export const weaponOptions = weaponCatalog.map(weapon => ({ value: weapon.url, label: weapon.name }));

/** Catalogs store stable arsenal IDs; renderers and custom models use URLs. */
export function weaponModel(weapon: WeaponReference | undefined) {
  return typeof weapon === 'number' ? weaponCatalog.find(asset => asset.weaponId === weapon)?.url : weapon;
}

export function weaponReference(model: string): WeaponReference | undefined {
  return weaponCatalog.find(asset => asset.url === model)?.weaponId ?? (model || undefined);
}

export function modelOptions(current: string | string[], configured: readonly { model: string; name: string }[] = []) {
  const options = new Map(weaponOptions.map(option => [option.value, option.label]));
  for (const option of configured) options.set(option.model, option.name);
  for (const url of typeof current === 'string' ? [current] : current) {
    if (url && !options.has(url)) options.set(url, `Custom · ${url.split('/').pop()}`);
  }
  return [...options].map(([value, label]) => ({ value, label }));
}
