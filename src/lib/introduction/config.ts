/** These cues are shared by the splash workbench and the Pages handoff. */
export type IntroductionConfig = {
  enabled: boolean;
  exitMs: number;
  exitDistance: number;
  entranceMs: number;
  firingMs: number;
  musicFadeMs: number;
};
export const introductionDefaults: IntroductionConfig = {
  enabled: true, exitMs: 650, exitDistance: 125, entranceMs: 450, firingMs: 3500, musicFadeMs: 650
};
export const introductionFile = 'src/instant-approval.ts';
