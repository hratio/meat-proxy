import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { splash2ConfigSchema, resolveSplash2Config, type Splash2Config } from '../../src/lib/components/splash/splash2-config';

/** Independent fixed-path saves preserve the shared landscape settings. */
export function splash2Store(path: string) {
  let pending = Promise.resolve();
  const read = async () => {
    const saved = splash2ConfigSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    return resolveSplash2Config({ ...saved, drift: saved.drift ?? { start: 'assembled', at: 0 } });
  };
  function save(input: unknown): Promise<Splash2Config> {
    const result = pending.then(async () => {
      const parsed = splash2ConfigSchema.partial().parse(input);
      // Defaults upgrade complete reads. A partial save must only replace keys
      // the caller supplied, so a portrait/timing edit retains authored colors.
      const patch = Object.fromEntries(Object.keys(input as object).map(key => [key, parsed[key as keyof typeof parsed]]));
      const current = await read();
      const config = resolveSplash2Config(splash2ConfigSchema.parse(resolveSplash2Config({ ...current, ...patch })));
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
