import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { splashConfigSchema, type SplashConfig } from '../../src/lib/components/splash/config';
import { mergeLandscape, type LandscapeOptions } from '../../src/lib/components/splash/landscape-config';

/** Fixed-path, serialized writes for the shared landscape settings. */
export function splashStore(path: string) {
  let pending = Promise.resolve();
  const read = async () => splashConfigSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  function save(input: unknown): Promise<SplashConfig> {
    const result = pending.then(async () => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a splash configuration.');
      const patch = input as Record<string, unknown>;
      for (const key of Object.keys(patch)) if (key !== 'landscape') throw new Error(`Unknown landscape setting: ${key}`);
      const current = await read();
      const config = splashConfigSchema.parse({ ...current, ...patch,
        landscape: patch.landscape === undefined ? current.landscape : mergeLandscape(current.landscape, patch.landscape as LandscapeOptions) });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, JSON.stringify(config, null, 2) + '\n'); await rename(temporary, path); }
      finally { await unlink(temporary).catch(() => {}); }
      return config;
    });
    pending = result.then(() => {}, () => {});
    return result;
  }
  return { read, save };
}
