import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const path = fileURLToPath(new URL('../../config/studio.json', import.meta.url));
const splashPath = fileURLToPath(new URL('../../src/lib/components/splash/startup.json', import.meta.url));
const splash2Path = fileURLToPath(new URL('../../src/lib/components/splash/splash2.json', import.meta.url));

// This middleware exists only in Vite's development server. The release has no writer.
export function studioPlugin(): Plugin {
  return {
    name: 'meat-proxy-studio',
    apply: 'serve',
    // Studio applies its own live updates. Watching its output as source code
    // would reload the browser and retire the running review service on every save.
    config: () => ({ server: { watch: { ignored: [path, splash2Path] } } }),
    configureServer(server) {
      let splash2: ReturnType<typeof import('./splash2-store.ts').splash2Store> | undefined;
      let splash2Factory: typeof import('./splash2-store.ts').splash2Store | undefined;
      server.middlewares.use('/__dev/api/splash2', async (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        try {
          // Reuse the save queue while picking up authoring schema changes
          // from Vite, instead of retaining a stale SSR module until restart.
          const { splash2Store } = await server.ssrLoadModule('/dev/server/splash2-store.ts');
          if (splash2Factory !== splash2Store) { splash2Factory = splash2Store; splash2 = splash2Store(splash2Path); }
          const store = splash2!;
          if (request.method === 'GET') { response.end(JSON.stringify({ path: splash2Path, config: await store.read() })); return; }
          if (request.method !== 'POST') { response.statusCode = 405; response.end('{}'); return; }
          if (!request.headers.origin || new URL(request.headers.origin).host !== request.headers.host) {
            response.statusCode = 403; response.end(JSON.stringify({ error: 'Save from the local workbench.' })); return;
          }
          let body = '';
          for await (const chunk of request) { body += chunk; if (body.length > 65536) throw new Error('Splash configuration is too large.'); }
          const config = await store.save(JSON.parse(body));
          for (const module of server.environments.client.moduleGraph.getModulesByFile(splash2Path) || []) server.environments.client.moduleGraph.invalidateModule(module);
          response.end(JSON.stringify({ path: splash2Path, config }));
        } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
      });
      let splash: ReturnType<typeof import('./splash-store.ts').splashStore> | undefined;
      let splashFactory: typeof import('./splash-store.ts').splashStore | undefined;
      server.middlewares.use('/__dev/api/splash', async (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        try {
          const { splashStore } = await server.ssrLoadModule('/dev/server/splash-store.ts');
          if (splashFactory !== splashStore) { splashFactory = splashStore; splash = splashStore(splashPath); }
          const store = splash!;
          if (request.method === 'GET') { response.end(JSON.stringify({ path: splashPath, config: await store.read() })); return; }
          if (request.method !== 'POST') { response.statusCode = 405; response.end('{}'); return; }
          if (!request.headers.origin || new URL(request.headers.origin).host !== request.headers.host) {
            response.statusCode = 403; response.end(JSON.stringify({ error: 'Save from the local workbench.' })); return;
          }
          let body = '';
          for await (const chunk of request) { body += chunk; if (body.length > 65536) throw new Error('Splash configuration is too large.'); }
          response.end(JSON.stringify({ path: splashPath, config: await store.save(JSON.parse(body)) }));
        } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
      });
      server.middlewares.use('/__dev/defaults', async (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        try {
          if (request.method === 'GET') {
            response.end(JSON.stringify({ path, defaults: JSON.parse(await readFile(path, 'utf8')) }));
            return;
          }
          if (request.method !== 'POST') { response.statusCode = 405; response.end('{}'); return; }
          if (!request.headers.origin || new URL(request.headers.origin).host !== request.headers.host) {
            response.statusCode = 403; response.end(JSON.stringify({ error: 'Use the local development page to save defaults.' })); return;
          }
          let body = '';
          for await (const chunk of request) {
            body += chunk;
            if (body.length > 262144) throw new Error('Studio settings are too large.');
          }
          const patch = JSON.parse(body);
          if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Expected an overrides object.');
          const current = JSON.parse(await readFile(path, 'utf8'));
          const { configSchema, validateGameOverrides } = await server.ssrLoadModule('/src/lib/config.ts');
          const preview = patch.preview === undefined ? undefined : configSchema.parse(patch.preview);
          if (patch.game !== undefined) {
            patch.game = validateGameOverrides(patch.game);
          }
          const { gameEventContentSchema } = await server.ssrLoadModule('/src/lib/game-events/schema.ts');
          const { migrateGameEventContent } = await server.ssrLoadModule('/src/lib/game-events/migrate.ts');
          const combined = { ...current, ...patch };
          // An older export may explicitly supply rules in its voice library.
          if (patch.events === undefined && Array.isArray(patch.adlibs?.rules)) delete combined.events;
          const content = gameEventContentSchema.parse(migrateGameEventContent(combined));
          for (const key of ['avatar', 'playback', 'game']) {
            if (patch[key] !== undefined) current[key] = patch[key];
          }
          Object.assign(current, content);
          const temporary = `${path}.${process.pid}.tmp`;
          await writeFile(temporary, JSON.stringify(current, null, 2) + '\n');
          await rename(temporary, path);
          // A later browser refresh must import the saved JSON. Invalidate client
          // transforms without sending HMR or invalidating the server's modules.
          for (const module of server.environments.client.moduleGraph.getModulesByFile(path) || []) {
            server.environments.client.moduleGraph.invalidateModule(module);
          }
          if (patch.game !== undefined) {
            // Keep the live draft, including edits to personal controls, until
            // the dev server restarts. Persist only authored defaults above.
            const { getService } = await server.ssrLoadModule('/src/lib/server/engine.ts');
            const { mergeDefaults } = await server.ssrLoadModule('/src/lib/tuning.ts');
            const service = await getService();
            const engine = await service.get();
            await service.settings(engine, () => engine.serialize(async () => {
              const config = preview ?? configSchema.parse(mergeDefaults(service.config, current.game));
              engine.syncSettings(config, service.catalog);
            }));
          }
          response.end(JSON.stringify({ path, defaults: current }));
        } catch (error) {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    }
  };
}
