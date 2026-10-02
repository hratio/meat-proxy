import { appendFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export const audioExtension = /\.(?:ogg|opus|mp3|wav|flac|m4a|aac|aiff?)$/i;

export function selectAudio({ profiles, clips }) {
  const selected = new Set();
  const add = url => {
    if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return;
    const path = url.split(/[?#]/)[0];
    const resolved = posix.normalize(decodeURIComponent(path));
    if (resolved.startsWith('/audio/')) selected.add(resolved.slice(1));
  };
  for (const profile of profiles) for (const role of ['shot', 'start', 'loop', 'stop']) add(profile.sound?.[role]);
  for (const clip of clips) if (clip.enabled !== false) add(clip.url);
  return selected;
}

// Evaluate the same defaults as the app, including saved Studio overrides.
// The development audio preset catalog is not a keep list.
export async function runtimeAudioAssets() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root, configFile: false, cacheDir: 'node_modules/.vite-distribution',
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }
  });
  try {
    const { defaults } = await server.ssrLoadModule('/src/lib/config.ts');
    const { weaponProfiles, fallbackWeaponProfile } = await server.ssrLoadModule('/src/lib/weapons/profiles.ts');
    const { reviewSoundClips } = await server.ssrLoadModule('/src/lib/review-audio.ts');
    const { gameEventDefaults } = await server.ssrLoadModule('/src/lib/game-events/defaults.ts');
    const { defaultSplash2Config } = await server.ssrLoadModule('/src/lib/components/splash/splash2-playback-config.ts');
    return selectAudio({
      profiles: [...Object.values(weaponProfiles), fallbackWeaponProfile, ...Object.values(defaults.weapons.profiles)],
      clips: [...Object.values(reviewSoundClips), ...gameEventDefaults.adlibs.clips, defaultSplash2Config.audio]
    });
  } finally { await server.close(); }
}

export async function pruneAudio(clientDirectory, selected) {
  if (resolve(clientDirectory) === resolve(root, 'static')) throw new Error('Audio filtering requires a build directory, not authoring assets');
  // Fail before removing anything if a configured clip is missing.
  for (const path of selected) {
    const file = await stat(join(clientDirectory, path)).catch(() => undefined);
    if (!file?.isFile()) throw new Error(`Selected audio is missing from the build: ${path}`);
  }
  const removed = [];
  let removedBytes = 0;
  for (const name of await readdir(join(clientDirectory, 'audio'), { recursive: true })) {
    const path = `audio/${name.replaceAll('\\', '/')}`;
    if (!audioExtension.test(path) || selected.has(path)) continue;
    const file = join(clientDirectory, path);
    removedBytes += (await stat(file)).size;
    await rm(file);
    removed.push(path);
  }
  return { kept: [...selected].sort(), removed: removed.sort(), removedBytes };
}

export function distributionAdapter(adapter) {
  return {
    ...adapter,
    async adapt(builder) {
      const report = await pruneAudio(builder.getClientDirectory(), await runtimeAudioAssets());
      builder.log(`Audio: ${report.kept.length} runtime clips; excluded ${report.removed.length} development clips (${(report.removedBytes / 1024).toFixed(1)} KiB)`);
      const serverNotices = await readFile(join(builder.getServerDirectory(), 'THIRD_PARTY_NOTICES.md'), 'utf8');
      await appendFile(join(builder.getClientDirectory(), 'THIRD_PARTY_NOTICES.md'), `\n\n${serverNotices}`);
      await adapter.adapt(builder);
    }
  };
}
