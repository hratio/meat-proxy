import { AnimationMixer, LoopRepeat } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { transitionDefaults, type AvatarTransitionFrame, type AvatarTransitions } from './transitions';

export const expressionNames = ['Idle', 'Clench', 'Shout', 'ShadesPeek', 'Grin', 'Surprise'] as const;
export type MockDaddyExpression = typeof expressionNames[number];

export type AvatarRequest = {
  id?: number;
  expression: MockDaddyExpression;
  /** Minimum display time after the entrance. Omit to play one complete clip. */
  durationMs?: number;
  policy?: 'queue' | 'interrupt';
  finishCycle?: boolean;
  /** The exit and entrance used to switch INTO this queued expression. */
  transition?: Partial<AvatarTransitions>;
};

export type AvatarPlayback = {
  expression: MockDaddyExpression;
  clipMs: number;
  clipTimeMs: number;
  elapsedMs: number;
  remainingMs: number;
  queue: MockDaddyExpression[];
  phase: AvatarTransitionFrame['phase'];
  nextExpression?: MockDaddyExpression;
};

export const createAvatarPlayback = (gltf: GLTF, onchange: (state: AvatarPlayback) => void, oncomplete?: (id: number) => void) => {
  const mixer = new AnimationMixer(gltf.scene);
  const actions = new Map(gltf.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  const roots = new Map(expressionNames.map(name => [name, gltf.scene.getObjectByName(`MockDaddy_${name}`)!]));
  const queue: AvatarRequest[] = [];
  let defaults = { ...transitionDefaults };
  let frame: AvatarTransitionFrame = { ...defaults, phase: 'steady', progress: 0 };
  let name: MockDaddyExpression = 'Idle';
  let elapsedMs = 0, endMs = Infinity, phaseMs = 0;
  let pending: AvatarRequest | undefined;
  let interruptAfterIntro: AvatarRequest | undefined;
  let revision = 0;
  let activeId: number | undefined;

  const state = (): AvatarPlayback => ({
    expression: name,
    clipMs: actions.get(name)!.getClip().duration * 1000,
    clipTimeMs: actions.get(name)!.time * 1000,
    elapsedMs,
    remainingMs: Number.isFinite(endMs) ? Math.max(0, endMs - elapsedMs) : 0,
    queue: queue.map(cue => cue.expression),
    phase: frame.phase,
    nextExpression: frame.phase === 'outro' ? pending?.expression || 'Idle' : interruptAfterIntro?.expression
  });

  const activate = (cue?: AvatarRequest) => {
    activeId = cue?.id;
    name = cue?.expression || 'Idle';
    elapsedMs = 0;
    mixer.stopAllAction();
    // Swap only while the old portrait is covered or fully outside its viewport.
    for (const [expression, root] of roots) root.visible = expression === name;
    const action = actions.get(name)!;
    const clipMs = action.getClip().duration * 1000;
    const requestedMs = Math.max(0, cue?.durationMs ?? clipMs);
    endMs = !cue ? Infinity : cue.finishCycle === false
      ? requestedMs
      : Math.max(1, Math.ceil(requestedMs / clipMs)) * clipMs;
    action.reset().setLoop(LoopRepeat, Infinity).play();
    mixer.update(0);
    revision++;
  };

  const begin = (cue?: AvatarRequest) => {
    pending = cue;
    phaseMs = 0;
    frame = { ...defaults, ...cue?.transition, phase: 'outro', progress: 0 };
    onchange(state());
  };

  const advancePhase = () => {
    phaseMs = 0;
    if (frame.phase === 'outro') {
      if (activeId !== undefined) { const id = activeId; activeId = undefined; oncomplete?.(id); }
      activate(pending);
      pending = undefined;
      frame = { ...frame, phase: 'intro', progress: 0 };
    } else {
      frame = { ...frame, phase: 'steady', progress: 0 };
      // The entrance holds pose zero so the requested full loop starts here.
      if (interruptAfterIntro) {
        const cue = interruptAfterIntro;
        interruptAfterIntro = undefined;
        begin(cue);
        return;
      }
    }
    onchange(state());
  };

  activate();onchange(state());
  return {
    get name() { return name; },
    get transition() { return frame; },
    get revision() { return revision; },
    state,
    setTransitions(value: Partial<AvatarTransitions>) {
      defaults = { ...transitionDefaults, ...value };
      defaults.introMs = Math.max(0, defaults.introMs);
      defaults.outroMs = Math.max(0, defaults.outroMs);
    },
    request(request: AvatarRequest) {
      // Snapshot settings: changing studio controls cannot alter an earlier cue.
      const cue = { ...request, transition: { ...defaults, ...request.transition } };
      // An externally queued cue can take over the empty return-to-idle reveal.
      // The preceding reaction's exit has already completed at this point.
      if (frame.phase === 'intro' && name === 'Idle' && activeId === undefined && !Number.isFinite(endMs)) {
        activate(cue); phaseMs = 0;
        frame = { ...cue.transition, phase: 'intro', progress: 0 };
        onchange(state()); return;
      }
      if (cue.policy === 'interrupt') {
        queue.length = 0;
        if (frame.phase === 'outro') {
          pending = cue;
          frame = { ...frame, intro: cue.transition.intro, introMs: cue.transition.introMs };
          onchange(state());
        } else if (frame.phase === 'intro') {
          // Finish the short visual reveal before departing, avoiding a jump.
          interruptAfterIntro = cue;
          onchange(state());
        } else begin(cue);
      } else if (frame.phase !== 'steady' || Number.isFinite(endMs)) {
        queue.push(cue);
        onchange(state());
      } else begin(cue);
    },
    reset() {
      queue.length = 0;pending = undefined;interruptAfterIntro = undefined;
      phaseMs = 0;frame = { ...defaults, phase: 'steady', progress: 0 };
      activate();onchange(state());
    },
    update(deltaSeconds: number, animate = true) {
      let remaining = Math.max(0, deltaSeconds * 1000);
      // Consume boundaries explicitly, so different frame rates preserve timing.
      while (remaining > 0) {
        if (frame.phase !== 'steady') {
          const duration = animate ? Math.max(0, frame.phase === 'outro' ? frame.outroMs : frame.introMs) : 0;
          const step = Math.min(remaining, Math.max(0, duration - phaseMs));
          if (frame.phase === 'outro') mixer.update(animate ? step / 1000 : 0);
          phaseMs += step;remaining -= step;
          frame = { ...frame, progress: duration ? Math.min(1, phaseMs / duration) : 1 };
          if (phaseMs >= duration) advancePhase();
          else break;
        } else {
          const step = Math.min(remaining, Math.max(0, endMs - elapsedMs));
          elapsedMs += step;remaining -= step;
          mixer.update(animate ? step / 1000 : 0);
          if (elapsedMs >= endMs) begin(queue.shift());
          else break;
        }
      }
    },
    dispose() { queue.length = 0;mixer.stopAllAction();mixer.uncacheRoot(gltf.scene); }
  };
};
