import { landscapeDefaults, landscapeSchema, mergeLandscape } from '$lib/components/splash/landscape-config';
import cinematicHarbor from '../assets/recipes/splash/cinematic-harbor.json';

const cinematic = landscapeSchema.parse(cinematicHarbor.landscape);

export const landscapePresets = [
  { name: 'Corporate Weather', description: 'Dark harbor, shared moving weather, dominant red branding.', colors: ['#253431','#c73431','#88e6ff'], settings: cinematic },
  { name: 'Corporate Weather · Low', description: 'Two atmosphere samples, landmark reflections and a smaller pixel budget.', colors: ['#253431','#c73431','#88e6ff'], settings: mergeLandscape(cinematic,{
    weather:{cloudSteps:2},water:{reflectionDetail:'landmarks'},quality:{megapixels:.8}
  }) },
  { name: 'Iron Harbor', description: 'Oxidized steel, amber windows, cold rain.', colors: ['#3e463e', '#b37843', '#8a8068'], settings: structuredClone(landscapeDefaults) },
  { name: 'After Midnight', description: 'Blue steel under a cold moon. Quiet, dark, cinematic.', colors: ['#182534', '#718ca4', '#cfb086'], settings: mergeLandscape(landscapeDefaults, {
    seed: 42017, city: { buildingColor: '#394956', trimColor: '#1e303d', windowColor: '#cfb086', accentColor: '#71a5bc' },
    lighting: { skyColor: '#111c2b', horizonColor: '#34475b', hazeColor: '#34455a', sunGlow: .1, temperature: -.18, moonBrightness: 1.5 },
    weather: { cloudColor: '#1b293d', fogColor: '#5f7a8d', fog: .3, rain: 1.3 },
    cinema: { look: 'steel', lookStrength: .35, bloom: .5 }, lightning: { style: 'forked', interval: 12, environment: .25 },
    mountains: { rockColor: '#2d3a46', snowColor: '#8097aa', height: 1.2 },
    water: { nearColor: '#111d28', farColor: '#263f51', glintColor: '#4b667b' }
  }) },
  { name: 'Furnace District', description: 'Smog, copper light, and towering industrial silhouettes.', colors: ['#342720', '#a64a22', '#d5914c'], settings: mergeLandscape(landscapeDefaults, {
    seed: 1666, city: { buildingColor: '#55423b', trimColor: '#37291f', windowColor: '#ed8a42', accentColor: '#bb6138', weathering: 1.5, pattern: 'ribbed' },
    lighting: { skyColor: '#2d211f', horizonColor: '#92543b', sunColor: '#ab4c1c', sunGlow: 1.5, hazeColor: '#654432', temperature: .2, moon: false },
    weather: { cloudColor: '#38251f', fogColor: '#ad754b', fog: .4, rain: .35, cloudCover: .8 },
    cinema: { look: 'amber', lookStrength: .35, grain: .06 }, lightning: { style: 'sheet', color: '#ffd7ad', interval: 18 },
    mountains: { rockColor: '#4f3a32', snowColor: '#9e8770', snowAmount: .1 },
    water: { nearColor: '#231b16', farColor: '#5e3d28', glintColor: '#896039' }
  }) },
  { name: 'Reactor Rain', description: 'Acid-green mist, red beacons, black water.', colors: ['#1e2d26', '#849a57', '#cc502e'], settings: mergeLandscape(landscapeDefaults, {
    seed: 1986, city: { buildingColor: '#39483c', trimColor: '#1c2b25', windowColor: '#b3b86a', accentColor: '#729e80', beaconColor: '#ff4828', pattern: 'concrete', weathering: 1.7 },
    lighting: { skyColor: '#1b2923', horizonColor: '#627252', hazeColor: '#465a42', sunColor: '#454d22', sunGlow: .5, moonBrightness: .7 },
    weather: { cloudColor: '#21392c', fogColor: '#829869', fog: .48, rain: 2, wind: -54 },
    cinema: { look: 'bleach', lookStrength: .4, bloom: .6 }, lightning: { style: 'crawler', interval: 8, color: '#d4ffdb' },
    mountains: { rockColor: '#334b3c', snowColor: '#859576', ruggedness: 1.6 },
    water: { nearColor: '#11241c', farColor: '#394e36', glintColor: '#667741', rippleStrength: 1.5 }
  }) }
];
