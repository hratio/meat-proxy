import type { IntroductionConfig } from './introduction/config';
import type { IntroductionPhase } from './introduction/director';
import type { BackgroundConfig } from './backgrounds/config';

/** An outer entry can prepare the review beneath its own splash. */
export type StartupHandoff = {
  covered: boolean;
  introduction?: IntroductionConfig;
  preview?: boolean;
  onintroduction?: (phase: IntroductionPhase) => void;
  onmusicend?: () => void;
  onready: (ready: boolean) => void;
  onerror: (message: string) => void;
  /** Register persistence without coupling the intro entry to the review API. */
  onintropreference?: (disable: () => Promise<void>) => void;
  onplayable?: (ready: boolean) => void;
  onaudiochange?: (sound: boolean, volume: number) => void;
  /** An entry that owns the scene also presents the review's live background. */
  onbackgroundchange?: (background: BackgroundConfig, reducedMotion: boolean) => void;
};
