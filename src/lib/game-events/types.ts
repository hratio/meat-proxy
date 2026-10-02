import type { AdlibClip } from '../adlibs/schema';
import type { AvatarRequest } from '../avatar/playback';
import type { AvatarOverrides } from '../avatar/presentation';

export type PortraitCue = { request: AvatarRequest; presentation?: AvatarOverrides };
export type TransmissionCue = {
  title: string;
  text: string;
  portrait: PortraitCue;
  splash?: 'signal' | 'impact';
  movement?: boolean;
  introSeconds?: number;
  outroSeconds?: number;
  /** Reading time for a silent, text-only transmission. */
  durationSec?: number;
};
export type GameCue = {
  key?: string;
  priority?: number;
  mode?: 'queue' | 'immediate';
  expiresMs?: number;
  voice?: AdlibClip;
  hud?: PortraitCue;
  transmission?: TransmissionCue;
};
export type TransmissionPhase = 'covering' | 'intro' | 'speaking' | 'outro' | 'shattering';
export type ActiveTransmission = {
  id: number;
  cue: TransmissionCue;
  phase: TransmissionPhase;
  introMs: number;
  outroMs: number;
  durationMs: number;
  shot?: { x: number; y: number };
};
export type GameEventsState = {
  transmission?: ActiveTransmission;
  hud?: { id: number; cue: PortraitCue };
  voice?: string;
  queued: { id: number; key: string; priority: number }[];
};
export type TransmissionDismissed = {
  type: 'transmission-dismissed';
  id: number;
  key?: string;
  reason: 'shot';
};
