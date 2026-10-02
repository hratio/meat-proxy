import { weaponExposureSchema, weaponLightingSchema, type WeaponLightingSettings } from '../../src/lib/weapons/lighting-config';

export const weaponLightingPresets: { name: string; description: string; settings: WeaponLightingSettings }[] = [
  { name: 'Gunmetal', description: 'Cool steel · warm edge', settings: { exposure: weaponExposureSchema.parse(undefined), lighting: weaponLightingSchema.parse({}) } },
  { name: 'Bunker', description: 'Low light · worn brass', settings: { exposure: .62, lighting: weaponLightingSchema.parse({
    ambient: { skyColor: '#9ba78e', groundColor: '#24261c', intensity: .3 },
    key: { color: '#cdbb92', intensity: 1.2, azimuth: -55, elevation: 50 },
    fill: { color: '#839796', intensity: .3 }, rim: { color: '#ca804c', intensity: .8 }, environmentIntensity: .18
  }) } },
  { name: 'Furnace', description: 'Amber fire · blue shadows', settings: { exposure: .75, lighting: weaponLightingSchema.parse({
    ambient: { skyColor: '#b2a194', groundColor: '#291f1c', intensity: .34 },
    key: { color: '#e9ad79', intensity: 1.65, azimuth: -55, elevation: 25 },
    fill: { color: '#839fb5', intensity: .38 }, rim: { color: '#f57742', intensity: 1.55, azimuth: 120 }, environmentIntensity: .24, environmentRotation: 30
  }) } },
  { name: 'Moonlight', description: 'Cold blue · silver edges', settings: { exposure: .72, lighting: weaponLightingSchema.parse({
    ambient: { skyColor: '#768bab', groundColor: '#1b2336', intensity: .38 },
    key: { color: '#9fbbdc', intensity: 1.8, azimuth: -45, elevation: 55 },
    fill: { color: '#c3a291', intensity: .28 }, rim: { color: '#93bfc9', intensity: 1.3 }, environmentIntensity: .28, environmentRotation: -25
  }) } }
];
