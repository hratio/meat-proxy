import { enterRepository } from '../root.mjs';
enterRepository();
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';

// Load the same TypeScript source as the app without starting a listening server.
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-config-schema', optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
try {
  const { userConfigSchema, catalogSchema } = await server.ssrLoadModule('/src/lib/config.ts');
  const { adlibSchema } = await server.ssrLoadModule('/src/lib/adlibs/schema.ts');
  const adlibs = JSON.stringify(z.toJSONSchema(adlibSchema, { io: 'input' }), null, 2) + '\n';
  await writeFile('schemas/adlibs.schema.json', adlibs);
  await writeFile('static/schemas/adlibs.schema.json', adlibs);
  const { gameEventSchema } = await server.ssrLoadModule('/src/lib/game-events/schema.ts');
  const events = JSON.stringify(z.toJSONSchema(gameEventSchema, { io: 'input' }), null, 2) + '\n';
  await writeFile('schemas/game-events.schema.json', events);
  await writeFile('static/schemas/game-events.schema.json', events);
  const json = JSON.stringify(z.toJSONSchema(userConfigSchema, { io: 'input' }), null, 2) + '\n';
  await writeFile('schemas/config.schema.json', json);
  await writeFile('static/schemas/config.schema.json', json);
  const catalog = JSON.stringify(z.toJSONSchema(catalogSchema, { io: 'input' }), null, 2) + '\n';
  await writeFile('schemas/catalog.schema.json', catalog);
  await writeFile('static/schemas/catalog.schema.json', catalog);
} finally {
  await server.close();
}
