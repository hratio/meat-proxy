import type { LandscapeConfig } from './landscape-config';

/** Only changes to the generated layout need new geometry; look controls use uniforms. */
export function landscapeGeometryKey(config: LandscapeConfig) {
  const { seed, city, landmarks, docks } = config;
  return JSON.stringify([seed, city.density, city.height, city.width, city.variation, city.roofDetail,
    landmarks.enabled, landmarks.gateScale, landmarks.gateX, landmarks.spireScale, landmarks.spireX,
    landmarks.observatoryScale, landmarks.observatoryX, docks.enabled, docks.density, docks.scale,
    docks.coastVariation, docks.relief, docks.pier,docks.quay,docks.quayHeight,docks.panelWidth,
    config.sequence?.enabled ? [config.sequence.bank,config.sequence.bankBuildings,config.sequence.bridge,config.sequence.junctionAtMs,
      config.sequence.travelMode,config.sequence.startX,config.sequence.speedKph,config.sequence.continueDriving,
      config.sequence.durationMs,config.sequence.turnRadius,config.sequence.bridgeRise,config.sequence.bridgeApproach,config.sequence.roadWidth,config.sequence.shoulder,config.camera.height,config.camera.distance,
      config.camera.offset,config.camera.panDistance,config.camera.settleSeconds,config.speed] : false]);
}

export function seededRandom(initial: number) {
  let state = initial;
  return () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
}
