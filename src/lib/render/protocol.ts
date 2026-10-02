import type { RenderSize } from './surface';

export type RendererKind = 'portrait' | 'weapons' | 'airstrike' | 'landscape';
export type RenderInput = { type: 'keydown' | 'keyup' | 'blur'; code?: string };
export type ToRenderer =
  | { type: 'init'; id: number; kind: RendererKind; canvas: OffscreenCanvas; state: object; size: RenderSize; timeOrigin: number }
  | { type: 'update'; id: number; patch: object }
  | { type: 'resize'; id: number; size: RenderSize }
  | { type: 'input'; id: number; event: RenderInput }
  | { type: 'dispose'; id: number };
export type FromRenderer =
  | { type: 'capability'; supported: boolean }
  | { type: 'event'; id: number; event: unknown }
  | { type: 'fault'; id: number; message: string };
