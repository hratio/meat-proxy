import { Color, Vector2, Vector3, type Texture } from 'three';
import type { LandscapeConfig } from './landscape-config';
import { routeDistrictCenter } from './driving-route';

/** World-space extinction shared by opaque surfaces, their mirrors, and the sky.
 * Intersect finite height slabs before sampling; there are no transparent cards
 * or separate cloud caps. The signed geometry depth limits each integration. */
export function createAtmosphere(noise: Texture, time: { value: number }, travel: { value: number }) {
  const uniforms = {
    airNoise: { value: noise }, airTime: time, airTravel: travel,
    airWind: { value: -45 }, airSpeed: { value: .55 }, airScale: { value: 1 },
    airBanks: { value: .65 }, airHeight: { value: 390 }, airThickness: { value: 150 }, airSteps: { value: 4 },
    airPeaks: {value:.55}, airPeakHeight: {value:640}, airPeakThickness: {value:155},
    airFog: { value: .24 }, airShoreHeight: { value: 18 }, airColor: { value: new Color('#566461') },
    airCeiling: { value: 1200 }, airCoverage: { value: .8 }, airOpacity: { value: .9 }, airSky: { value: 1 },
    airMoon: { value: new Vector3() }, airFrontX: {value:0},
    airRouteOrigin: {value:new Vector2()}, airRouteStart: {value:900}, airRouteFade: {value:650},
    airRouteHeight: {value:160}, airRouteDensity: {value:1}, airWaterLevel: {value:0},
    airStreetDensity: {value:.85}, airStreetDistance: {value:260}, airStreetHeight: {value:28}, airStreetStart: {value:12},
    airCloudLighting: {value:.7}, airCloudLightColor: {value:new Color('#89908f')}, airMoonGlow: {value:1}
  };
  return { uniforms, configure(config: LandscapeConfig) {
    const w = config.weather, u = uniforms;
    u.airWind.value=w.wind; u.airSpeed.value=w.cloudSpeed; u.airScale.value=w.cloudScale;
    u.airBanks.value=w.banksEnabled?w.bankDensity:0; u.airHeight.value=w.bankHeight; u.airThickness.value=w.bankThickness;
    u.airPeaks.value=w.banksEnabled?w.peakDensity:0; u.airPeakHeight.value=w.peakHeight;u.airPeakThickness.value=w.peakThickness;
    u.airSteps.value=Math.min(8,w.cloudSteps); u.airFog.value=w.fogEnabled?w.fog:0; u.airShoreHeight.value=w.shorelineHeight*w.fogHeight;
    u.airColor.value.set(w.fogColor); u.airCeiling.value=w.ceilingHeight; u.airCoverage.value=w.cloudCover;
    u.airOpacity.value=w.cloudOpacity; u.airSky.value=w.skyEnabled?1:0;
    u.airFrontX.value=config.landmarks.gateX;
    u.airRouteOrigin.value.set(routeDistrictCenter(config),config.camera.distance);
    u.airRouteStart.value=w.endFogStart;u.airRouteFade.value=w.endFogFade;u.airRouteHeight.value=w.endFogHeight;
    u.airRouteDensity.value=w.endFogEnabled?w.endFogDensity:0;u.airWaterLevel.value=config.water.waterLevel;
    u.airStreetDensity.value=w.streetFogEnabled?w.streetFogDensity:0;u.airStreetDistance.value=w.streetFogDistance;
    u.airStreetHeight.value=w.streetFogHeight;u.airStreetStart.value=w.streetFogStart;
    u.airCloudLighting.value=w.cloudLighting;u.airCloudLightColor.value.set(w.cloudLightColor);
    u.airMoonGlow.value=config.lighting.moon?config.lighting.moonGlow*.75:0;
  }};
}

export const atmosphereShader = `
  uniform sampler2D airNoise;
  uniform float airTime, airTravel, airWind, airSpeed, airScale;
  uniform float airBanks, airHeight, airThickness, airSteps, airFog, airShoreHeight;
  uniform float airPeaks, airPeakHeight, airPeakThickness;
  uniform float airCeiling, airCoverage, airOpacity, airSky;
  uniform vec3 airColor, airMoon;
  uniform float airFrontX;
  uniform vec2 airRouteOrigin;
  uniform float airRouteStart, airRouteFade, airRouteHeight, airRouteDensity, airWaterLevel;
  uniform float airStreetDensity, airStreetDistance, airStreetHeight, airStreetStart, airCloudLighting, airMoonGlow;
  uniform vec3 airCloudLightColor;
  vec2 weatherPosition(vec3 p) {
    // City geometry scrolls instead of the camera: restore its world address.
    return vec2(p.x + airTravel - airTime * airWind * .014 * airSpeed, p.z + airTime * .24 * airSpeed);
  }
  float weatherMass(vec2 p) {
    vec2 q = p * .000036 * airScale;
    return texture2D(airNoise, q).r * .78 + texture2D(airNoise, q * 2.07 + .31).r * .22;
  }
  float ceilingCover(vec3 direction) {
    if (airSky < .5 || direction.y < .015) return 0.0;
    vec3 point = cameraPosition + direction * (airCeiling - cameraPosition.y) / direction.y;
    float mass = weatherMass(weatherPosition(point));
    float opening = exp(-pow(length(direction - airMoon) / .22, 2.0));
    mass -= opening * (.22 + .14 * texture2D(airNoise, weatherPosition(point) * .00007 + .17).r);
    float threshold = mix(.78, .23, airCoverage);
    return smoothstep(threshold - .12, threshold + .12, mass) * airOpacity;
  }
  // Moon scatter and city uplight belong to the cloud mass, not the clear sky.
  // World positions keep the broad uplight patch fixed during a camera turn.
  vec3 cloudIllumination(vec3 direction, vec3 origin) {
    vec3 point=origin+direction*max(0.0,airCeiling-origin.y)/max(.025,direction.y);
    vec2 address=vec2(point.x+airTravel-airFrontX,point.z+650.0)/vec2(1800.0,1400.0);
    float city=exp(-dot(address,address));
    float moon=exp(-pow(length(direction-airMoon)/.32,2.0));
    return airCloudLightColor*airCloudLighting*(.015+.13*moon*airMoonGlow+.075*city);
  }
  float weatherLayer(vec3 origin, vec3 ray, float distance, float height, float thickness, float bank) {
    float dy = abs(ray.y) < .00001 ? .00001 : ray.y;
    float a = (height - thickness * .65 - origin.y) / dy;
    float b = (height + thickness * .65 - origin.y) / dy;
    float begin = max(0.0, min(a,b)), end = min(distance, max(a,b));
    if (end <= begin) return 0.0;
    float optical = 0.0;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= airSteps) break;
      vec3 p = origin + ray * mix(begin,end,(float(i)+.5)/airSteps);
      vec2 address = weatherPosition(p);
      float mass = weatherMass(address);
      float coastline = 1.0 - smoothstep(-290.0, -90.0, p.z);
      float undulation = (mass - .5) * thickness * .68;
      float vertical = exp(-pow((p.y - height - undulation) / (thickness * .32), 2.0));
      float broken = .18 + .82 * smoothstep(.28, .67, mass);
      float behind = smoothstep(-1350.0, -900.0, p.z);
      // A broad weather front below the supporting shafts, shared across the
      // whole city. It is never cut away around a display.
      float frontDistance=address.x-airFrontX;
      float front = .55 + 1.45 * exp(-pow(frontDistance/510.0,2.0));
      optical += coastline * vertical * mix(.45 + mass * .55, broken * front * behind, bank);
    }
    return optical * (end - begin) / airSteps;
  }
  // A distant weather bank at either end of the X route and out to sea (+Z).
  // Integrate from the boundary along the viewing ray, so nearby surfaces stay
  // clear and the same fog covers road, water and sky during a backwards look.
  float routeFogDepth(vec3 point) {
    if (airRouteDensity <= 0.0) return 0.0;
    vec3 delta=point-cameraPosition;
    float distance=length(delta);
    vec3 ray=delta/max(distance,.001);
    vec2 origin=cameraPosition.xz+vec2(airTravel,0.0)-airRouteOrigin;
    float tx=abs(ray.x)>.00001?(sign(ray.x)*airRouteStart-origin.x)/ray.x:1.e8;
    float tz=ray.z>.00001?(airRouteStart-origin.y)/ray.z:1.e8;
    float entry=max(0.0,min(tx,tz)), lengthInFog=max(0.0,distance-entry);
    float altitude=max(0.0,cameraPosition.y+ray.y*(entry+min(lengthInFog,airRouteFade)*.5)-airWaterLevel);
    return min(8.0,pow(lengthInFog/airRouteFade,2.0)*6.0)*airRouteDensity*exp(-altitude/airRouteHeight);
  }
  // Analytic exponential height fog: no extra raymarch, and no coastline mask.
  // At density 1 a level ray at water height retains 37% after the distance.
  float streetFogDepth(vec3 point) {
    if(airStreetDensity<=0.0) return 0.0;
    vec3 delta=point-cameraPosition;
    float distance=length(delta), span=max(0.0,distance-airStreetStart);
    vec3 start=cameraPosition+delta*(min(distance,airStreetStart)/max(.001,distance));
    float a=max(0.0,start.y-airWaterLevel)/airStreetHeight;
    float b=max(0.0,point.y-airWaterLevel)/airStreetHeight;
    float difference=b-a;
    float average=abs(difference)<.001?exp(-.5*(a+b)):(exp(-a)-exp(-b))/difference;
    return span*average*airStreetDensity/airStreetDistance;
  }
  vec3 applyAtmosphere(vec3 color, vec3 point) {
    if (airBanks + airFog + airPeaks + airRouteDensity + airStreetDensity <= 0.0) return color;
    vec3 delta = point - cameraPosition;
    float distance = length(delta);
    vec3 ray = delta / max(distance,.001);
    float depth = routeFogDepth(point)+streetFogDepth(point);
    if (airFog > 0.0) depth += weatherLayer(cameraPosition,ray,distance,airShoreHeight*.45,airShoreHeight*2.0,0.0) * airFog * .004;
    float cloudDepth=0.0;
    if (airBanks > 0.0) cloudDepth += weatherLayer(cameraPosition,ray,distance,airHeight,airThickness,1.0) * airBanks * .006;
    if (airPeaks > 0.0) cloudDepth += weatherLayer(cameraPosition,ray,distance,airPeakHeight,airPeakThickness,1.0) * airPeaks * .006;
    float transmission = exp(-min(depth+cloudDepth,5.0));
    vec3 scatter = airColor * (.65 + .35 * max(0.0,dot(ray,airMoon)));
    return color * transmission + scatter * (1.0-transmission)
      + cloudIllumination(ray,cameraPosition)*(1.0-exp(-cloudDepth))*exp(-depth);
  }
`;
