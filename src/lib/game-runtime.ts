import { retainAudioContext, createWeaponAudio, playSound } from './audio';
import { createReviewAudio } from './review-audio';
import { createGameEvents } from './game-events/controller';
import { gameEventDefaults } from './game-events/defaults';

// Game-only services must dispose pending work when switching to review mode.
export function createGameRuntime(ports: Parameters<typeof createGameEvents>[1]) {
  const releaseAudio = retainAudioContext();
  const weaponAudio = createWeaponAudio(ports.onerror ?? (() => {}));
  const reviewAudio = createReviewAudio(ports.onerror ?? (() => {}));
  const events = createGameEvents(gameEventDefaults, ports);
  return {
    weaponAudio, reviewAudio, events, playSound,
    dispose() { weaponAudio.dispose(); reviewAudio.dispose(); events.dispose(); releaseAudio(); }
  };
}

export type GameRuntime = ReturnType<typeof createGameRuntime>;
