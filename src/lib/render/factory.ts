import type { RendererKind } from './protocol';
import type { RenderEngine, RenderOptions } from './surface';

/** The browser fallback and worker load the same engines and asset paths. */
export async function createRenderer(kind: RendererKind, options: RenderOptions<any, any>): Promise<RenderEngine<any>> {
  switch (kind) {
    case 'portrait': return (await import('../avatar/renderer')).createPortraitRenderer(options);
    case 'weapons': return (await import('../weapons/renderer')).createWeaponRenderer(options);
    case 'airstrike': return (await import('../weapons/airstrike')).createAirstrikeRenderer(options);
    case 'landscape': return (await import('../components/splash/renderer')).createLandscapeRenderer(options);
  }
}
