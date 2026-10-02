import { expect, it } from 'vitest';
import startup from './startup.json';
import { landscapeSchema, mergeLandscape } from './landscape-config';
import { resolveSplashConfig } from './playback-config';
import { drivingFrame } from './driving-sequence';
import { bridgeGrade, carRoute, drivingTravel, garageFade, garagePlacement, garageSchedule, routeCenter, routeLayout, routeLocal } from './driving-route';
import { sectionalDoorPose } from './driving-garage';

const world = () => landscapeSchema.parse(startup.landscape);

it('moves the bay and its cues together when the title or metre trim changes', () => {
  const a = world(), initial = garageSchedule(a);
  a.sequence.titleAtMs += 1000;
  const retimed = garageSchedule(a);
  expect(retimed.entryAtMs - initial.entryAtMs).toBe(1000);
  expect(retimed.entryTravel - initial.entryTravel).toBeCloseTo(a.sequence.speedKph / 3.6);
  expect(retimed.openAtMs - initial.openAtMs).toBe(1000);
  expect(retimed.holdAtMs - initial.holdAtMs).toBe(1000);
  a.sequence.garage.distanceOffset = 50;
  expect(garageSchedule(a).entryTravel - retimed.entryTravel).toBeCloseTo(50);
});

it.each([1, -1])('brakes smoothly inside the garage in travel direction %d', sign => {
  const a = world(); a.speed = sign * Math.abs(a.speed);
  const g = garageSchedule(a), end = g.entryTravel + sign * (a.sequence.garage.depth - 7);
  const before = drivingTravel(g.entryAtMs - 1, a), entry = drivingTravel(g.entryAtMs, a), after = drivingTravel(g.entryAtMs + 1, a);
  expect(sign * (entry - before) * 1000).toBeCloseTo(g.speed, 2);
  expect(sign * (after - entry) * 1000).toBeCloseTo(g.speed, 2);
  expect(drivingTravel(g.entryAtMs + 100000, a)).toBeCloseTo(end);
  expect(drivingTravel(g.entryAtMs + 200000, a)).toBeCloseTo(end);
  const p = garagePlacement(a), lane = carRoute(entry, a);
  const local = routeLocal([lane.x, lane.y, lane.z], p);
  expect(Math.abs(local[0])).toBeLessThan(.01);
  expect(Math.abs(local[2])).toBeLessThan(a.sequence.garage.width / 2);
});

it('holds the camera in world space while the car continues into the bay', () => {
  const a = world(), hold = garageSchedule(a).holdAtMs;
  const first = drivingFrame(hold / 1000, a, 16 / 9), later = drivingFrame((hold + 1200) / 1000, a, 16 / 9);
  expect(later.travel).toBeGreaterThan(first.travel);
  expect(later.camera[0] + later.travel).toBeCloseTo(first.camera[0] + first.travel);
  expect(later.camera.slice(1)).toEqual(first.camera.slice(1));
  expect(later.target[0] + later.travel).toBeCloseTo(first.target[0] + first.travel);
  expect(later.target.slice(1)).toEqual(first.target.slice(1));
  expect(later.up).toEqual(first.up);
  expect(drivingFrame(hold / 1000, a, 16 / 9)).toEqual(first);
  a.sequence.garage.holdCamera = false;
  expect(drivingFrame((hold + 1200) / 1000, a, 16 / 9).camera[2]).not.toBeCloseTo(first.camera[2]);
});

it('grades the climb before the turn and returns smoothly to the original landing', () => {
  const a = world(), r = routeLayout(a), begin = r.junction - a.sequence.bridgeApproach;
  expect(bridgeGrade(begin, a)).toEqual({ y: r.base, slope: 0 });
  expect(bridgeGrade(r.junction - 20, a).y).toBeGreaterThan(r.base + 2);
  expect(routeCenter(r.junction + r.span, a).y).toBeCloseTo(r.cityHeight);
  expect(bridgeGrade(r.junction + r.span, a).slope).toBe(0);
  const crest = r.junction + Math.min(r.turn + 90, r.span * .46);
  expect(bridgeGrade(crest, a).y).toBeCloseTo(Math.max(r.base + a.sequence.bridgeRise, r.cityHeight + 4));
  expect(Math.abs(bridgeGrade(crest - .001, a).slope - bridgeGrade(crest + .001, a).slope)).toBeLessThan(.0001);
  expect(bridgeGrade(crest + 50, a).slope).toBeLessThan(0);
});

it('rolls the shutter panels continuously from vertical to overhead', () => {
  const height = 4.7, radius = .65, bendEnd = height + radius * Math.PI / 2;
  expect(sectionalDoorPose(height, height)).toEqual({ x: 0, y: height, angle: 0 });
  expect(sectionalDoorPose(height + .001, height).x).toBeLessThan(.00001);
  const top = sectionalDoorPose(bendEnd, height);
  expect(top.x).toBeCloseTo(radius); expect(top.y).toBeCloseTo(height + radius);
  expect(top.angle).toBeCloseTo(Math.PI / 2);
  expect(sectionalDoorPose(bendEnd + 1, height).x).toBeCloseTo(radius + 1);
  expect(sectionalDoorPose(.17 + height + 1.2, height).y).toBeGreaterThan(height);
});

it('fades only after its cue, is deterministic when seeking backward, and can be disabled', () => {
  const a = world(), cue = garageSchedule(a).fadeAtMs;
  expect(garageFade(cue - 1, a)).toBe(0);
  expect(garageFade(cue + a.sequence.garage.fadeDurationMs / 2, a)).toBeCloseTo(.5);
  expect(garageFade(cue + a.sequence.garage.fadeDurationMs, a)).toBe(1);
  expect(garageFade(cue - 1, a)).toBe(0);
  a.sequence.garage.fade = false; expect(garageFade(cue + 10000, a)).toBe(0);
  a.sequence.garage.fade = true; a.sequence.enabled = false;
  expect(garageFade(cue + 10000, a)).toBe(0);
});

it('preserves nested garage settings when changing just one control', () => {
  const a = world(), patch = { sequence: { garage: { openDurationMs: 3100 } } };
  for (const merged of [mergeLandscape(a, patch), resolveSplashConfig({ landscape: patch }).landscape]) {
    expect(merged.sequence.garage).toEqual({ ...a.sequence.garage, openDurationMs: 3100 });
    expect(merged.sequence.frames).toEqual(a.sequence.frames);
  }
  const legacy = structuredClone(startup.landscape) as Record<string, any>;
  delete legacy.sequence.garage;
  expect(landscapeSchema.parse(legacy).sequence.garage.enabled).toBe(false);
});
