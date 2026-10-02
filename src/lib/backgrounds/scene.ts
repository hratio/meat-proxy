import { defaultSplashConfig } from '../components/splash/playback-config';
import { defaultOpeningConfig } from '../components/splash/opening-config';
import type { LandscapeConfig } from '../components/splash/landscape-config';

const world = defaultSplashConfig.landscape;
export const introSceneSettings: LandscapeConfig = {
  ...world,
  speed: defaultOpeningConfig.scene.speed,
  opacity: defaultOpeningConfig.scene.opacity,
  fadeInMs: defaultOpeningConfig.scene.fadeInMs,
  fadeOutMs: defaultOpeningConfig.scene.fadeOutMs
};

// The settled waterfront composition is independent of the intro playhead.
// Appearance controls belong to CSS; the renderer only animates the world.
export const backgroundSceneSettings: LandscapeConfig = {
  ...world, speed: 0, opacity: 1,
  sequence: { ...world.sequence, enabled: false },
  quality: { ...world.quality, fps: 15, megapixels: Math.min(1, world.quality.megapixels) }
};
