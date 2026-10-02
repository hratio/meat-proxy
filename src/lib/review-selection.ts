import type { Aim } from './types';

export type ReviewSelection = { from: Aim; aim: Aim };
export type ChooseViolation = (selection: ReviewSelection, position: { x: number; y: number }) => void;
