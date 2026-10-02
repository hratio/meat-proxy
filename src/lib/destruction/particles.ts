import type { CharacterFragment, DestructionShot } from './model';
import { characterLaunch, type DebrisMotionSettings } from './motion';

type Sprite = { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number; scale: number };
type Particle = { sprite?: Sprite; born: number; life: number; x: number; y: number; vx: number; vy: number; gravity: number; spin: number; angle: number };
export type DebrisSettings = DebrisMotionSettings & { particleLimit: number; particleLifetimeMs: number; reducedMotion: boolean; pixelRatio: number; fps: number; paused: boolean };

/** Bounded atlas caches text rasterization. Existing particles retain old pages
 * through a cache rollover, so a new font/theme never changes debris in flight. */
function createAtlas() {
  let cache = new Map<string, Sprite>(), page: HTMLCanvasElement | undefined;
  let x = 0, y = 0, rowHeight = 0;
  function get(fragment: CharacterFragment, ratio: number): Sprite {
    const key = `${ratio}:${fragment.font}:${fragment.color}:${fragment.text}`;
    const cached = cache.get(key); if (cached) return cached;
    if (cache.size >= 512) { cache = new Map(); page = undefined; }
    if (!page) { page = document.createElement('canvas'); page.width = page.height = 1024; x = y = rowHeight = 0; }
    let context = page.getContext('2d')!;
    context.font = fragment.font;
    const metrics = context.measureText(fragment.text);
    const width = Math.min(1024, Math.ceil((Math.max(metrics.width, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) + 6) * ratio));
    const height = Math.min(1024, Math.ceil((fragment.size * 1.8 + 6) * ratio));
    if (x + width > 1024) { x = 0; y += rowHeight; rowHeight = 0; }
    if (y + height > 1024) {
      page = document.createElement('canvas'); page.width = page.height = 1024;
      context = page.getContext('2d')!; x = y = rowHeight = 0;
    }
    const sprite = { canvas: page, x, y, width, height, scale: ratio };
    context.save(); context.beginPath(); context.rect(x, y, width, height); context.clip();
    context.translate(x + width / 2, y + height / 2); context.scale(ratio, ratio);
    context.font = fragment.font; context.fillStyle = fragment.color;
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(fragment.text, 0, 0); context.restore();
    x += width; rowHeight = Math.max(rowHeight, height); cache.set(key, sprite);
    return sprite;
  }
  return { get, clear() { cache.clear(); page = undefined; } };
}

export function createCharacterDebris(canvas: HTMLCanvasElement, settings: () => DebrisSettings) {
  const context = canvas.getContext('2d')!;
  const atlas = createAtlas(), pool: Particle[] = [];
  let frame = 0, last = 0, cursor = 0, width = 0, height = 0;
  // Readable via the renderer in the browser benchmark; no per-frame DOM writes.
  const stats = { emitted: 0, frames: 0, active: 0, peak: 0, paintMs: 0 };
  function resize() {
    width = innerWidth; height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, settings().pixelRatio, 2);
    canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function clear() {
    cancelAnimationFrame(frame); frame = 0;
    for (const particle of pool) particle.sprite = undefined;
    stats.active = 0; context.clearRect(0, 0, width, height);
  }
  function paint(time: number) {
    frame = 0;
    const config = settings();
    if (document.hidden || config.paused || config.reducedMotion) { clear(); return; }
    if (time - last < 1000 / config.fps - .5) { frame = requestAnimationFrame(paint); return; }
    last = time;
    const start = performance.now();
    context.clearRect(0, 0, width, height);
    let active = 0;
    for (const particle of pool) {
      if (!particle.sprite) continue;
      const age = Math.max(0, time - particle.born), t = age / 1000;
      const x = particle.x + particle.vx * t, y = particle.y + particle.vy * t + .5 * particle.gravity * t * t;
      if (age >= particle.life || x < -60 || x > width + 60 || y > height + 60) { particle.sprite = undefined; continue; }
      active++;
      const sprite = particle.sprite, w = sprite.width / sprite.scale, h = sprite.height / sprite.scale;
      context.save(); context.translate(x, y); context.rotate(particle.angle + particle.spin * t);
      context.globalAlpha = Math.min(1, (1 - age / particle.life) * 3);
      context.drawImage(sprite.canvas, sprite.x, sprite.y, sprite.width, sprite.height, -w / 2, -h / 2, w, h);
      context.restore();
    }
    stats.active = active; stats.peak = Math.max(stats.peak, active); stats.frames++; stats.paintMs += performance.now() - start;
    if (active) frame = requestAnimationFrame(paint);
  }
  function emit(shot: DestructionShot) {
    const config = settings();
    if (config.reducedMotion || config.paused || document.hidden) return;
    if (pool.length > config.particleLimit) pool.length = config.particleLimit;
    const born = performance.now(), ratio = Math.min(devicePixelRatio || 1, config.pixelRatio, 2);
    for (const fragment of shot.fragments) {
      if (fragment.x < 0 || fragment.x > width || fragment.y < 0 || fragment.y > height) continue;
      let particle: Particle;
      if (pool.length < config.particleLimit) { particle = { born: 0, life: 0, x: 0, y: 0, vx: 0, vy: 0, gravity: 0, spin: 0, angle: 0 }; pool.push(particle); }
      else particle = pool[cursor++ % pool.length];
      Object.assign(particle, { sprite: atlas.get(fragment, ratio), born, life: config.particleLifetimeMs * (.8 + Math.random() * .2),
        x: fragment.x, y: fragment.y, ...characterLaunch(fragment, shot.point, config), angle: 0 });
      stats.emitted++;
    }
    if (shot.fragments.length && !frame) frame = requestAnimationFrame(paint);
  }
  resize(); window.addEventListener('resize', resize); document.addEventListener('visibilitychange', clear);
  return { emit, stats, clear, dispose() { clear(); atlas.clear(); pool.length = 0; window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', clear); } };
}
