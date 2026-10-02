import type { LandscapeConfig } from './landscape-config';
import { drivingFrame } from './driving-sequence';

export type ShotId = string;
export type Shot = { id: ShotId; name: string; description: string; start: number; end: number };
export type Point = [number, number, number];
export type SequenceFrame = {
  shot: ShotId;
  travel: number;
  anchor: number;
  camera: Point;
  target: Point;
  up?: Point;
  fov: number;
  roll: number;
};

/** The timeline shows five seconds of the final hold; playback holds forever. */
export function sequenceShots(world: LandscapeConfig): Shot[] {
  if (world.sequence?.enabled && world.sequence.frames.length >= 2) {
    const beats = [...world.sequence.frames].sort((a, b) => a.atMs - b.atMs);
    return beats.map((beat, i) => ({ id: beat.id, name: beat.name,
      description: `${beat.target} · ${beat.fov}° lens`, start: beat.atMs / 1000,
      end: (beats[i + 1]?.atMs ?? Math.max(world.sequence.durationMs + 5000, world.sequence.titleAtMs + 6000)) / 1000 }));
  }
  const speed = Math.abs(world.speed) || 70;
  const settle = world.camera.settleSeconds;
  const glide = Math.max(0.5, world.camera.panDistance / speed - settle / 2);
  return [
    { id: 'glide', name: 'Waterfront glide', description: 'Pan along the waterfront.', start: 0, end: glide },
    { id: 'settle', name: 'Debris reveal', description: 'Slow down beside the floating chairs, keyboards and CRT monitors.', start: glide, end: glide + settle },
    { id: 'hold', name: 'Hold on the skyline', description: 'The camera stays here. Water, weather and lights continue.', start: glide + settle, end: glide + settle + 5 }
  ];
}

/** Absolute sampling keeps the splash, preview and reverse scrubbing identical. */
export function sequenceFrame(time: number, world: LandscapeConfig, aspect = 16 / 9): SequenceFrame {
  if (world.sequence?.enabled && world.sequence.frames.length >= 2) return drivingFrame(time, world, aspect);
  const shots = sequenceShots(world), [glide, settle, hold] = shots;
  const seconds = world.speed === 0 || world.camera.panDistance === 0 ? hold.start : Math.max(0, Math.min(hold.start, time));
  const shot = shots.find(s => seconds < s.end) ?? hold;
  const lens = world.camera;
  const distance = lens.panDistance * (Math.sign(world.speed) || 1);
  const anchor = lens.offset + distance;
  const speed = distance / (glide.end + lens.settleSeconds / 2);
  const brake = Math.max(0, Math.min(lens.settleSeconds, seconds - glide.end));
  const traveled = seconds <= glide.end ? seconds * speed
    : glide.end * speed + speed * (brake - brake * brake / (2 * lens.settleSeconds));
  const travel = seconds < settle.end ? anchor - distance + traveled : anchor;
  return {
    shot: shot.id, travel, anchor,
    camera: [0, lens.height, lens.distance],
    target: [Math.tan(lens.yaw * Math.PI / 180) * (lens.distance + 700), lens.targetHeight, -700],
    fov: lens.fov, roll: lens.roll * Math.PI / 180
  };
}
