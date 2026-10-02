import * as THREE from 'three';
import { createModelLoader } from '../models/loader';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeWeapon, frameWeapon } from './runtime';
import { loadPreviewEnvironment } from './preview-environment';

export type PreviewStatus = 'loading' | 'preparing' | 'ready' | 'error';

// Yield past a paint, rather than keeping startup in a chain of microtasks.
const afterPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => { setTimeout(resolve, 0); }));

/** A small inspection room. Each mounted viewer owns and releases its GPU resources. */
export function createWeaponPreview(canvas: HTMLCanvasElement, onstatus: (status: PreviewStatus) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // The inspector uses Three's stock shaders. Querying every shader's debug
  // log forces GPU synchronization even when there is no error to report.
  renderer.debug.checkShaderErrors = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // The camera orbits a stationary model: its shadows only change on selection.
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#353d42');
  scene.fog = new THREE.Fog('#353d42', 8, 22);
  scene.environmentIntensity = .8;
  const camera = new THREE.PerspectiveCamera(34, 1, .05, 40);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2.1;
  controls.maxDistance = 6.5;
  controls.minPolarAngle = .2;
  controls.maxPolarAngle = Math.PI / 2 + .04;
  controls.autoRotateSpeed = .55;

  const metal = new THREE.MeshStandardMaterial({ color: '#464e53', roughness: .68, metalness: .35 });
  const room = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 16), metal.clone());
  room.material.side = THREE.BackSide;
  room.position.y = 3.2;
  scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), metal);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.3;
  floor.receiveShadow = true;
  scene.add(floor);

  const seamGeometry = new THREE.BoxGeometry(.012, .003, 16);
  const seamMaterial = new THREE.MeshStandardMaterial({ color: '#252e34', roughness: .9 });
  for (let i = -7; i <= 7; i++) {
    for (const crosswise of [false, true]) {
      const seam = new THREE.Mesh(seamGeometry, seamMaterial);
      seam.position.set(crosswise ? 0 : i, -1.297, crosswise ? i : 0);
      if (crosswise) seam.rotation.y = Math.PI / 2;
      scene.add(seam);
    }
  }

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.5, .12, 80),
    new THREE.MeshStandardMaterial({ color: '#454e54', metalness: .7, roughness: .38 })
  );
  pedestal.position.y = -1.23;
  pedestal.receiveShadow = true;
  scene.add(pedestal);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1.44, .008, 6, 80),
    new THREE.MeshStandardMaterial({ color: '#a9b8bc', emissive: '#81969e', emissiveIntensity: .45, metalness: .6, roughness: .35 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -1.167;
  scene.add(rim);

  const stripGeometry = new THREE.BoxGeometry(5, .035, .035);
  const stripMaterial = new THREE.MeshStandardMaterial({ color: '#e4edf0', emissive: '#c1d5df', emissiveIntensity: 2 });
  for (let side = 0; side < 4; side++) {
    const wall = new THREE.Group();
    const strip = new THREE.Mesh(stripGeometry, stripMaterial);
    strip.position.set(0, 1.7, -7.94);
    wall.add(strip);
    wall.rotation.y = side * Math.PI / 2;
    scene.add(wall);
  }

  scene.add(new THREE.HemisphereLight(0xd9e5ee, 0x303339, 1.6));
  const key = new THREE.DirectionalLight(0xffeee0, 3.2);
  key.position.set(-3, 6, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -3;
  key.shadow.camera.right = key.shadow.camera.top = 3;
  key.shadow.normalBias = .025;
  key.shadow.bias = -.0002;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbacddd, 2);
  fill.position.set(3, 2, 3);
  scene.add(fill);

  let model: THREE.Object3D | undefined;
  let disposed = false, generation = 0, frame = 0, last = 0, contextLost = false, prepared = false;
  const environmentReady = loadPreviewEnvironment().then(texture => {
    if (disposed) texture.dispose();
    else scene.environment = texture;
    return true;
  }).catch(() => false);
  const loader = createModelLoader();
  const framingDistance = (aspect: number) => 3.7 * Math.max(1, 1.2 / aspect);

  function reset() {
    controls.reset();
    controls.target.set(0, 0, 0);
    const detailedSide = model?.getObjectByName('Weapon')?.userData.primaryHand === 'right' ? -1 : 1;
    const distance = framingDistance(camera.aspect);
    camera.position.set(detailedSide * distance * .73, distance * .28, -distance * .7);
    controls.update();
  }

  let previousWidth = 0, previousHeight = 0;
  const resize = () => {
    // Layout dimensions exclude the dialog's opening scale animation.
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height || (width === previousWidth && height === previousHeight)) return;
    previousWidth = width; previousHeight = height;
    renderer.setSize(width, height, false);
    const previousDistance = framingDistance(camera.aspect);
    camera.aspect = width / height;
    // Preserve orbit and relative zoom while fitting a narrower inspection bay.
    if (model) camera.position.sub(controls.target).multiplyScalar(framingDistance(camera.aspect) / previousDistance).add(controls.target);
    controls.maxDistance = Math.max(6.5, framingDistance(camera.aspect) * 1.7);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  reset();

  const render = (time: number) => {
    frame = requestAnimationFrame(render);
    const delta = Math.min((time - last) / 1000, .05);
    last = time;
    if (document.hidden || contextLost || !prepared) return;
    controls.update(delta);
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(render);
  const lostContext = (event: Event) => { event.preventDefault(); contextLost = true; onstatus('error'); };
  canvas.addEventListener('webglcontextlost', lostContext);

  return {
    async load(url: string) {
      if (disposed) return;
      const request = ++generation;
      const current = () => !disposed && !contextLost && request === generation;
      prepared = false;
      controls.enabled = false;
      if (model) { scene.remove(model); disposeWeapon(model); model = undefined; }
      if (contextLost) { onstatus('error'); return; }
      onstatus('loading');
      try {
        const gltf = await loader.loadAsync(url);
        if (!current()) { disposeWeapon(gltf.scene); return; }
        model = frameWeapon(gltf.scene);
        model.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = true; });
        scene.add(model);
        reset();
        onstatus('preparing');
        if (!await environmentReady) throw new Error('Inspection lighting unavailable');
        if (!current()) return;
        await afterPaint();
        if (!current()) return;
        // No render loop runs during compilation: drawing early would force
        // the GPU to finish synchronously and stall the opening UI.
        await renderer.compileAsync(scene, camera);
        if (!current()) return;
        const textures = new Set<THREE.Texture>();
        if (scene.environment) textures.add(scene.environment);
        model.traverse(node => {
          if (!(node instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
          }
        });
        let uploadStart = performance.now();
        for (const texture of textures) {
          renderer.initTexture(texture);
          if (performance.now() - uploadStart >= 4) {
            await afterPaint();
            if (!current()) return;
            uploadStart = performance.now();
          }
        }
        renderer.shadowMap.needsUpdate = true;
        renderer.render(scene, camera);
        // Reveal after drawing and yielding a frame, rather than when the
        // model download ends. The browser handles GPU presentation itself.
        await afterPaint();
        if (!current()) return;
        prepared = true;
        controls.enabled = true;
        onstatus('ready');
      } catch {
        if (!disposed && request === generation) {
          if (model) { scene.remove(model); disposeWeapon(model); model = undefined; }
          onstatus('error');
        }
      }
    },
    setAutoRotate(enabled: boolean) { controls.autoRotate = enabled; },
    rotate(direction: number) {
      camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * Math.PI / 8).add(controls.target);
      controls.update();
    },
    reset,
    dispose() {
      disposed = true;
      generation++;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', lostContext);
      controls.dispose();
      key.shadow.dispose();
      disposeWeapon(scene);
      scene.environment?.dispose();
      scene.environment = null;
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}

export type WeaponPreview = ReturnType<typeof createWeaponPreview>;
