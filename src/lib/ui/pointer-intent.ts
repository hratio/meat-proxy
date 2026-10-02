export type PointerSample = { x: number; y: number; time: number };
export type IntentBounds = { left: number; right: number; top: number; bottom: number };
export type PointerIntentState = { near: boolean; inside: boolean; active: boolean; confidence: number };
export type PointerIntentOptions = {
  radiusPx: number;
  sampleMs: number;
  confirmMs: number;
  confidence: number;
  releaseMs: number;
  idleMs: number;
  predictionMs: number;
  tolerancePx: number;
  minSpeed: number;
  minTravelPx: number;
};

export const pointerIntentDefaults: Readonly<PointerIntentOptions> = {
  radiusPx: 200, sampleMs: 24, confirmMs: 48, confidence: .78,
  releaseMs: 72, idleMs: 180, predictionMs: 80, tolerancePx: 12,
  minSpeed: .04, minTravelPx: 4,
};

const empty = (): PointerIntentState => ({ near: false, inside: false, active: false, confidence: 0 });

// A short, acceleration-adjusted ray must intersect the target, not merely
// pass closer to it. This rejects parallel passes through the detection circle.
function intersectsRay(point: PointerSample, vx: number, vy: number, bounds: IntentBounds, padding: number) {
  let entry = 0, exit = Infinity;
  for (const [position, velocity, low, high] of [
    [point.x, vx, bounds.left - padding, bounds.right + padding],
    [point.y, vy, bounds.top - padding, bounds.bottom + padding],
  ]) {
    if (Math.abs(velocity) < .00001) { if (position < low || position > high) return false; }
    else {
      const a = (low - position) / velocity, b = (high - position) / velocity;
      entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    }
  }
  return exit >= entry;
}

/** Geometry-only tracker, independent of Svelte and browser event handling. */
export function createPointerIntent(options: Partial<PointerIntentOptions> = {}) {
  const tuning = { ...pointerIntentDefaults, ...options };
  let state = empty();
  let previous: PointerSample | undefined, velocity: { x: number; y: number } | undefined;
  let confirming: number | undefined, departing: number | undefined, travel = 0;
  const clearHistory = () => { previous = undefined; velocity = undefined; confirming = undefined; departing = undefined; travel = 0; };
  const reset = () => { clearHistory(); return state = empty(); };
  const idle = () => {
    if (!state.inside) { clearHistory(); state = { ...state, active: false, confidence: 0 }; }
    return state;
  };

  function sample(point: PointerSample, bounds: IntentBounds, inside = point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom) {
    const dx = (bounds.left + bounds.right) / 2 - point.x, dy = (bounds.top + bounds.bottom) / 2 - point.y;
    const distance = Math.hypot(dx, dy), near = inside || distance <= tuning.radiusPx;
    if (inside) { clearHistory(); return state = { near: true, inside: true, active: true, confidence: 1 }; }
    if (!near) return reset();
    // Leaving the actual target always releases the highlight, even while still
    // inside the larger detection circle. A new approach needs fresh evidence.
    if (state.inside || !previous || point.time - previous.time > tuning.idleMs) {
      clearHistory(); previous = point;
      return state = { near, inside: false, active: false, confidence: 0 };
    }
    const dt = point.time - previous.time;
    if (dt < tuning.sampleMs) return state;
    const vx = (point.x - previous.x) / dt, vy = (point.y - previous.y) / dt;
    const speed = Math.hypot(vx, vy);
    const oldDistance = Math.hypot(dx + point.x - previous.x, dy + point.y - previous.y);
    const closing = (oldDistance - distance) / dt;
    // Bound acceleration's influence: one noisy sample must not swing the
    // predicted heading farther than the current velocity itself.
    let ax = velocity ? (vx - velocity.x) / dt : 0, ay = velocity ? (vy - velocity.y) / dt : 0;
    const change = Math.hypot(ax, ay) * tuning.predictionMs;
    const weight = change ? Math.min(1, speed * .75 / change) : 0;
    ax *= weight; ay *= weight;
    const px = vx + ax * tuning.predictionMs, py = vy + ay * tuning.predictionMs;
    const projectedSpeed = Math.hypot(px, py);
    const alignment = projectedSpeed && distance ? (px * dx + py * dy) / (projectedSpeed * distance) : 0;
    const confidence = Math.max(0, Math.min(1, alignment));
    const candidate = speed >= tuning.minSpeed && closing >= tuning.minSpeed && confidence >= tuning.confidence && intersectsRay(point, px, py, bounds, tuning.tolerancePx);
    previous = point; velocity = { x: vx, y: vy };
    if (candidate) {
      confirming ??= point.time;
      travel += Math.max(0, oldDistance - distance);
      departing = undefined;
      if (point.time - confirming >= tuning.confirmMs && travel >= tuning.minTravelPx) state = { ...state, active: true };
    } else {
      confirming = undefined; travel = 0;
      // Ignore tiny tremors. Sustained movement on a different heading, or a
      // turn away from the target, releases before leaving the circle.
      if (speed >= tuning.minSpeed) {
        departing ??= point.time;
        if (point.time - departing >= tuning.releaseMs) state = { ...state, active: false };
      }
    }
    return state = { ...state, near, inside: false, confidence };
  }

  return { sample, idle, reset, get state() { return state; }, tuning };
}
