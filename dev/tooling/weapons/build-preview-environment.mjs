import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Bake the same neutral room used by the weapon renderer. The inspection bay
// loads this filtered HDR texture directly instead of compiling and rendering
// an entire PMREM pipeline during its opening animation.
const root = new URL('../../../', import.meta.url);
const modules = new Map([
  ['/three.js', new URL('node_modules/three/build/three.module.js', root)],
  ['/three.core.js', new URL('node_modules/three/build/three.core.js', root)],
  ['/room.js', new URL('node_modules/three/examples/jsm/environments/RoomEnvironment.js', root)]
]);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.route('http://inspection.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"/three.js"}}</script>' });
    const source = modules.get(pathname);
    if (!source) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: 'text/javascript', body: await readFile(source) });
  });
  await page.goto('http://inspection.test/');
  const { width, height, pixels } = await page.evaluate(async () => {
    const THREE = await import('/three.js');
    const { RoomEnvironment } = await import('/room.js');
    const renderer = new THREE.WebGLRenderer();
    const room = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(renderer);
    const target = generator.fromScene(room, .04, .1, 100, { size: 128 });
    const pixels = new Uint16Array(target.width * target.height * 4);
    await renderer.readRenderTargetPixelsAsync(target, 0, 0, target.width, target.height, pixels);
    const result = { width: target.width, height: target.height, pixels: Array.from(pixels) };
    target.dispose(); generator.dispose(); room.dispose(); renderer.dispose();
    return result;
  });
  // Header: ASCII PRDE, uint32 width, uint32 height. Payload: little-endian
  // RGBA float16, in Three.js's CubeUV layout, linear color, no extra mipmaps.
  const bytes = Buffer.alloc(12 + pixels.length * 2);
  bytes.write('PRDE'); bytes.writeUInt32LE(width, 4); bytes.writeUInt32LE(height, 8);
  pixels.forEach((value, index) => bytes.writeUInt16LE(value, 12 + index * 2));
  const output = new URL('static/models/weapons/inspection-environment.bin', root);
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, bytes);
  console.log(`${fileURLToPath(output)}: ${width} × ${height}, ${bytes.length} bytes`);
} finally { await browser.close(); }
