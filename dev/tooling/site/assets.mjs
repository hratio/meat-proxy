import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dedup, draco } from '@gltf-transform/functions';
import { createModelIO } from '../models/io.mjs';
import { readGLB, writeGLB } from '../models/glb.mjs';

// Compress output copies using weapon-export precision. Authoring GLBs can
// remain uncompressed; the opening scene shares one decoder for both models.
const io = await createModelIO(true);
for (const name of ['waterfront', 'driving-set']) {
  const source = `static/scenery/${name}.glb`, output = `build-pages/scenery/${name}.glb`;
  const document = await io.read(source);
  await document.transform(dedup(), draco({ quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 16 }));
  await io.write(output, document);
  const { json, binary } = readGLB(await readFile(output));
  delete json.asset.generator;
  const bytes = writeGLB(json, binary);
  await writeFile(output, bytes);
  // SvelteKit's Vite preview serves this intermediate client tree, not the
  // adapter's build-pages directory. Preview must measure the published asset.
  await writeFile(join(process.env.MEAT_PROXY_KIT_DIR || '.svelte-kit-pages', 'output/client/scenery', `${name}.glb`), bytes);
  console.log(`Pages ${name}: ${(await stat(source)).size} → ${(await stat(output)).size} bytes`);
}
