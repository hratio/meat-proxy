import type { AvatarRequest } from '$lib/avatar/playback';

export type AvatarLabOptions = {
  clickCycle: boolean;
  paused: boolean;
  durationMs: number;
  policy: NonNullable<AvatarRequest['policy']>;
  finishCycle: boolean;
};
