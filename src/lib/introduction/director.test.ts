import { afterEach, expect, it, vi } from 'vitest';
import { createIntroduction } from './director';
import { introductionDefaults } from './config';
import { introductionCombat } from './combat';
import { DestructionController, destructionKey } from '$lib/destruction/model';

afterEach(() => vi.useRealTimers());

function setup() {
  vi.useFakeTimers();
  const actions = {
    change: vi.fn(), ready: vi.fn(() => false), aim: vi.fn((_progress: number) => true), fire: vi.fn(), stop: vi.fn(),
    defeated: vi.fn(() => false), completionFinished: vi.fn(() => false), restore: vi.fn(),
    restored: vi.fn(() => false), fadeMusic: vi.fn(), release: vi.fn()
  };
  const director = createIntroduction(introductionDefaults, actions);
  const frame = (ms: number) => { vi.advanceTimersByTime(ms); director.update(performance.now()); };
  director.start();
  return { director, actions, frame };
}

it('waits for actual zero health, confirmed completion and restoration, even when shooting runs over time', () => {
  const { director, actions, frame } = setup();
  frame(1000); expect(actions.fire).not.toHaveBeenCalled();
  actions.ready.mockReturnValue(true); frame(0);
  expect(actions.fire).toHaveBeenCalledOnce();
  frame(introductionDefaults.firingMs + 1000);
  expect(actions.change).toHaveBeenLastCalledWith('firing');
  expect(actions.aim).toHaveBeenLastCalledWith(1);
  expect(actions.stop).not.toHaveBeenCalled();
  actions.defeated.mockReturnValue(true); frame(0);
  expect(actions.change).toHaveBeenLastCalledWith('completing');
  frame(1000); expect(actions.restore).not.toHaveBeenCalled();
  actions.completionFinished.mockReturnValue(true); frame(0);
  expect(actions.fadeMusic).toHaveBeenCalledOnce();
  frame(introductionDefaults.musicFadeMs); expect(actions.release).not.toHaveBeenCalled();
  actions.restored.mockReturnValue(true); frame(0);
  expect(actions.release).toHaveBeenCalledOnce();
  expect(actions.change).toHaveBeenLastCalledWith('done');
  director.dispose(); expect(actions.release).toHaveBeenCalledOnce();
});

it('cancels held input without completing the file when interrupted', () => {
  const { director, actions, frame } = setup();
  actions.ready.mockReturnValue(true); frame(1000);
  director.cancel(); frame(10_000);
  expect(actions.stop).toHaveBeenCalled();
  expect(actions.change).not.toHaveBeenCalledWith('completing');
  expect(actions.restore).toHaveBeenCalledOnce();
  expect(actions.release).toHaveBeenCalledOnce();
});

it('resumes a hidden introduction without expiring its watchdog or advancing the aim', () => {
  const { director, actions, frame } = setup();
  actions.ready.mockReturnValue(true); frame(1000); frame(500);
  const progress = actions.aim.mock.lastCall![0];
  director.setPaused(true); frame(60_000);
  expect(actions.stop).not.toHaveBeenCalled();
  expect(actions.aim).toHaveBeenLastCalledWith(progress);
  director.setPaused(false); frame(0);
  expect(actions.aim).toHaveBeenLastCalledWith(progress);
  frame(500);
  expect(actions.aim.mock.lastCall![0]).toBeGreaterThan(progress);
  director.dispose();
});

it.each(['arena', 'damage', 'completion', 'restoration'])('returns control if %s stalls', async stalled => {
  const { actions, frame } = setup();
  if (stalled !== 'arena') {
    actions.ready.mockReturnValue(true); frame(1000);
    if (stalled !== 'damage') actions.defeated.mockReturnValue(true);
    frame(introductionDefaults.firingMs);
    if (stalled === 'restoration') { actions.completionFinished.mockReturnValue(true); frame(0); }
  }
  frame(30_000);
  expect(actions.fire).toHaveBeenCalledTimes(stalled === 'arena' ? 0 : 1);
  expect(actions.release).toHaveBeenCalledOnce();
  expect(actions.change).toHaveBeenLastCalledWith('done');
});

it('reacts to an early lethal hit without waiting for the shooting timer', () => {
  const { actions, frame } = setup();
  actions.ready.mockReturnValue(true); frame(1000);
  actions.defeated.mockReturnValue(true); frame(100);
  expect(actions.change).toHaveBeenLastCalledWith('completing');
  expect(actions.restore).not.toHaveBeenCalled();
});

it.each([
  [3500, [290, 290], 26], [2200, [290, 290], 16], [8000, [290, 290], 56], [3500, [200, 300], 30]
])('calibrates real damage for %d ms and both weapon cadences', (duration, intervals, hits) => {
  const file = { path: 'target.ts', revision: 'a' }, controller = new DestructionController();
  controller.sync('demo', [file], {});
  controller.toggle(file, introductionCombat(80, duration, intervals));
  let contact = false;
  // The other cannon may have already punched a hole here; contact still counts.
  controller.surface(destructionKey(file), { hit: () => ({ contact, changed: false, fragments: [] }) });
  const shoot = () => controller.shoot(file, {}, { x: 50, y: 50 }, 'flak', 'flak', 0, 80);
  expect(shoot()).toBeUndefined();
  expect(controller.target(file)?.damage).toBe(0);
  contact = true;
  for (let i = 1; i < hits; i++) {
    expect(shoot()?.complete).toBe(false);
    expect(controller.target(file)!.damage).toBeLessThan(80);
  }
  expect(shoot()).toMatchObject({ shots: hits, complete: true, progress: 1 });
  expect(controller.target(file)?.damage).toBe(80);
  expect(shoot()).toBeUndefined();
  controller.sync('demo', [file], { [file.path]: file.revision });
  expect(controller.target(file)).toBeUndefined();
});

it('keeps ordinary destruction at one HP per new-material hit and clears temporary tuning', () => {
  const file = { path: 'target.ts', revision: 'a' }, controller = new DestructionController();
  controller.sync('demo', [file], {});
  controller.toggle(file, introductionCombat(80, 3500, [290, 290]));
  controller.reset(); controller.toggle(file);
  let changed = false;
  controller.surface(destructionKey(file), { hit: () => ({ contact: true, changed, fragments: [] }) });
  const shoot = () => controller.shoot(file, {}, { x: 50, y: 50 }, 'flak', 'flak', 0, 2);
  expect(shoot()).toBeUndefined();
  changed = true;
  expect(shoot()?.complete).toBe(false);
  expect(controller.target(file)?.damage).toBe(1);
  expect(shoot()?.complete).toBe(true);
  expect(controller.target(file)?.damage).toBe(2);
});
