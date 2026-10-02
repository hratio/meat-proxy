import { defaultSplashConfig } from './playback-config';
import { defaultSplash2Config, type Splash2Config } from './splash2-playback-config';
import type { LandscapeConfig } from './landscape-config';

/** The sequence owns the title's arrival; the title editor owns its assembly. */
export function openingConfig(artwork: Splash2Config, world: LandscapeConfig): Splash2Config {
  return world.sequence?.enabled ? { ...artwork, openingDelay: world.sequence.titleAtMs,
    scene: { ...artwork.scene, speed: world.speed } } : artwork;
}
export const defaultOpeningConfig = openingConfig(defaultSplash2Config, defaultSplashConfig.landscape);
