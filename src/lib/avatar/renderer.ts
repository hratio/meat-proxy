import * as THREE from 'three';
import { createAvatarPlayback, type AvatarPlayback, type AvatarRequest } from './playback';
import { createMockDaddyEffects, type MockDaddyEffectsOptions } from './effects';
import { transitionDefaults, type AvatarTransitionFrame, type AvatarTransitions } from './transitions';
import { createPortraitColorGrade } from './color-grade';
import { portraitSignalFrame, type PortraitSignalPhase } from './signal';
import { effectPresets, type AvatarEffectsPreset, type AvatarFraming, type AvatarMotion, type AvatarQuality, type AvatarTilt } from './presentation';
import { loadPortraitModel } from './model';
import { loadPreviewEnvironment } from '../weapons/preview-environment';
import { prepareWeapon } from '../weapons/prepare';
import { startupTiming } from '../startup';
import { nextFrame, cancelFrame, renderClock, type RenderEngine, type RenderOptions } from '../render/surface';

export type PortraitState = {
  request?: AvatarRequest; transitions: AvatarTransitions; effects: AvatarEffectsPreset; effectOverrides: Partial<MockDaddyEffectsOptions>;
  effectsEnabled: boolean; tilt: AvatarTilt; motion: AvatarMotion; framing: AvatarFraming; quality: AvatarQuality;
  reducedMotion: boolean; paused: boolean; hidden: boolean; visible: boolean; bare: boolean;
  puff: number; flash: number; reset: number; startup: 'closed' | 'opening' | 'ready';
  reportPlayback?: boolean;
  signal: PortraitSignalPhase; signalDurationMs: number;
};
export type PortraitEvent =
  | { type: 'loaded' }
  | { type: 'error'; message: string }
  | { type: 'playback'; state: AvatarPlayback }
  | { type: 'complete'; id: number }
  | { type: 'transition'; frame: AvatarTransitionFrame }
  | { type: 'startup-complete' };

export function createPortraitRenderer(options: RenderOptions<PortraitState, PortraitEvent>): RenderEngine<PortraitState> {
  let state = { ...options.state }, size = options.size;
  const { canvas, emit } = options, clock = renderClock(options.timeOrigin);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: state.bare, powerPreference: 'low-power' });
  renderer.debug.checkShaderErrors = false;
  renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene(), head = new THREE.Group();
  const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, .1, 20);
  camera.position.z = 6; scene.add(head);
  let controller: ReturnType<typeof createAvatarPlayback> | undefined, particles: ReturnType<typeof createMockDaddyEffects> | undefined;
  let grade: Awaited<ReturnType<typeof createPortraitColorGrade>> | undefined;
  let model: Awaited<ReturnType<typeof loadPortraitModel>> | undefined, environment: THREE.Texture | undefined;
  let disposed = false, loaded = false, failed = false, frame = 0, lastFrame = 0, lastReport = 0, time = 0, revision = -1;
  let entranceMs = 0, entranceComplete = false, lastTransition = '';
  let signalTime = 0, signalElapsed = 0;
  let appliedRequest: AvatarRequest | undefined;
  const complete = (id: number) => emit({ type: 'complete', id });
  const report = (value: AvatarPlayback) => emit({ type: 'playback', state: value });
  const signalFrame = () => portraitSignalFrame(state.signal, signalTime, signalElapsed, state.signalDurationMs, !state.bare, state.reducedMotion);
  function resize() {
    const width = Math.max(1, size.width), height = Math.max(1, size.height), ratio = Math.max(size.pixelRatio, state.quality.renderScale);
    renderer.setPixelRatio(ratio); renderer.setSize(width, height, false); grade?.resize();
    const aspect = width / height;
    camera.left = -1.5 * Math.max(1, aspect); camera.right = -camera.left;
    camera.top = 1.5 * Math.max(1, 1 / aspect); camera.bottom = -camera.top; camera.updateProjectionMatrix();
  }
  function transition() {
    const value: AvatarTransitionFrame = state.startup !== 'ready'
      ? { ...transitionDefaults, phase: 'intro', intro: 'shutter-open', progress: state.startup === 'closed' ? 0 : entranceMs / startupTiming.shutter }
      : !state.reducedMotion && controller ? controller.transition : { ...transitionDefaults, phase: 'steady', progress: 0 };
    const key = JSON.stringify(value);
    if (key !== lastTransition) { lastTransition = key; emit({ type: 'transition', frame: value }); }
  }
  function canAnimate() { return !disposed && loaded && !state.hidden && state.visible && (!state.paused || state.startup === 'opening' && !entranceComplete); }
  function wake() {
    cancelFrame(frame); frame = 0;
    if (disposed || !loaded || state.hidden || !state.visible) return;
    lastFrame = clock.now();
    draw(lastFrame, true);
    if (canAnimate()) frame = nextFrame(animate);
  }
  function animate(stamp: number) {
    frame = 0;
    if (!canAnimate()) return;
    draw(clock.fromFrame(stamp));
    frame = nextFrame(animate);
  }
  function draw(now: number, force = false) {
    if (!grade || !loaded || disposed) return;
    if (!force && now - lastFrame < 1000 / state.quality.fps - .5) return;
    const delta = Math.max(0, Math.min((now - lastFrame) / 1000, .05)); lastFrame = now;
    const dt = state.paused ? 0 : delta, { motion, framing, tilt, reducedMotion } = state;
    time += dt * motion.speed;
    if (!reducedMotion) signalTime += dt;
    signalElapsed += dt * 1000;
    const zoom = framing.zoom * (state.signal === 'off' ? 1 : state.bare ? .82 : .9);
    if (camera.zoom !== zoom) { camera.zoom = zoom; camera.updateProjectionMatrix(); }
    camera.position.x = -framing.offsetXPx * (camera.right - camera.left) / (Math.max(1, size.width) * camera.zoom);
    camera.position.y = framing.offsetYPx * (camera.top - camera.bottom) / (Math.max(1, size.height) * camera.zoom);
    const amount = reducedMotion ? 0 : motion.amount;
    const response = !motion.responseMs || reducedMotion ? 1 : 1 - Math.exp(-dt * 1000 / motion.responseMs);
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, THREE.MathUtils.degToRad(THREE.MathUtils.clamp(tilt.pitch + Math.sin(time * 1.3) * amount * 3, -8, 8)), response);
    head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, THREE.MathUtils.degToRad(THREE.MathUtils.clamp(tilt.yaw + Math.sin(time * .8) * amount * 5, -8, 8)), response);
    head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, THREE.MathUtils.degToRad(tilt.roll + Math.cos(time * 1.7) * amount * 3), response);
    head.position.x = Math.sin(time * 1.7) * amount * .035; head.position.y = Math.sin(time * 2.1) * amount * .055;
    controller?.update(dt, !reducedMotion);
    if (controller && revision !== controller.revision) { revision = controller.revision; particles?.clear(); }
    particles?.update(reducedMotion ? 0 : dt);
    if (state.startup === 'opening') entranceMs = Math.min(startupTiming.shutter, entranceMs + delta * 1000);
    transition(); grade.render(scene, camera, signalFrame());
    if (state.startup === 'opening' && entranceMs >= startupTiming.shutter && !entranceComplete) {
      entranceComplete = true; emit({ type: 'startup-complete' });
    }
    if (state.reportPlayback && controller && now - lastReport >= 250) { lastReport = now; report(controller.state()); }
  }
  function configure() {
    controller?.setTransitions(state.transitions);
    particles?.set({ ...effectPresets[state.effects], ...state.effectOverrides }); particles?.setEnabled(state.effectsEnabled);
    if (state.request && state.request !== appliedRequest && controller) {
      appliedRequest = state.request; controller.request(state.request);
    }
  }
  resize(); transition();
  void (async () => {
    // Load shared CPU resources concurrently, while retaining ownership on every error path.
    const tasks = await Promise.allSettled([loadPortraitModel(), createPortraitColorGrade(renderer), loadPreviewEnvironment()]);
    if (tasks[0].status === 'fulfilled') model = tasks[0].value;
    if (tasks[1].status === 'fulfilled') grade = tasks[1].value;
    if (tasks[2].status === 'fulfilled') environment = tasks[2].value;
    if (disposed) { model?.release(); grade?.dispose(); environment?.dispose(); return; }
    const error = tasks.find(result => result.status === 'rejected');
    if (error?.status === 'rejected') throw error.reason;
    head.add(model!.gltf.scene);
    controller = createAvatarPlayback(model!.gltf, report, complete);
    particles = createMockDaddyEffects({ gltf: model!.gltf, controller, environment: environment!, camera, scene });
    configure(); resize();
    if (!await prepareWeapon(renderer, scene, camera, head, () => !disposed)) return;
    // The grade's full-screen material has a separate shader from the model.
    await grade!.prepare(scene, camera, () => !disposed);
    if (disposed) return;
    grade!.render(scene, camera, signalFrame());
    loaded = true; emit({ type: 'loaded' }); wake();
  })().catch(error => {
    if (disposed) return;
    failed = true; emit({ type: 'error', message: String(error) });
    if (state.request?.id !== undefined) complete(state.request.id);
  });
  return {
    update(patch) {
      const previous = state;
      state = { ...state, ...patch };
      if (state.signal !== previous.signal || state.signal === 'connecting' && state.request?.id !== previous.request?.id) signalElapsed = 0;
      if (patch.reset && patch.reset !== previous.reset) controller?.reset();
      if (patch.puff && patch.puff !== previous.puff) particles?.puff();
      if (patch.flash && patch.flash !== previous.flash) particles?.flashGlasses();
      if (failed && state.request && state.request !== previous.request && state.request.id !== undefined) complete(state.request.id);
      configure();
      if (patch.quality) resize();
      transition(); wake();
    },
    resize(next) { size = next; resize(); wake(); },
    dispose() {
      if (disposed) return;
      disposed = true; cancelFrame(frame); particles?.dispose(); controller?.dispose();
      model?.release(); grade?.dispose(); if (!particles) environment?.dispose();
      renderer.dispose(); renderer.forceContextLoss();
    }
  };
}
