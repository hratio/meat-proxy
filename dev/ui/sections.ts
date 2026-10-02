import { UserRound, PanelsTopLeft, Monitor, Crosshair, Hand, Target, Gamepad2, Volume2, Cpu } from '@lucide/svelte';
import type { Config } from '$lib/config';
import type { SettingsGroup, SettingsPage } from '$lib/components/settings/navigation';

export type TuningPage = SettingsPage & { section?: keyof Config; fields?: string[] };
type TuningGroup = Omit<SettingsGroup, 'pages'> & { pages: TuningPage[] };
const page = (id: string, label: string, description: string): TuningPage => ({ id, label, description });
const fields = (section: keyof Config, id: string, label: string, description: string, keys: string): TuningPage => ({ id, label, description, section, fields: keys.split(' ') });

export const studioGroups: TuningGroup[] = [
  { id: 'portrait', label: 'Portrait', icon: UserRound, pages: [
    page('avatar-playback', 'Expressions & playback', ''),
    page('avatar-transitions', 'Entrance & exit', 'Select an expression to preview the transition.'),
    page('avatar-framing', 'Framing & quality', ''),
    page('avatar-motion', 'Tilt & movement', ''),
    page('avatar-effects', 'Lighting & effects', '')
  ] },
  { id: 'hud', label: 'HUD', icon: PanelsTopLeft, pages: [
    page('hud-assembly', 'Layout & proportions', ''),
    page('hud-navigator', 'V-code navigator', ''),
    page('hud-lettering', 'Code & lettering', ''),
    page('hud-portrait', 'Portrait', ''),
    page('hud-timing', 'Timing & motion', ''),
    page('hud-surface', 'Surface & icons', '')
  ] },
  { id: 'interface', label: 'Interface', icon: Monitor, pages: [
    fields('display', 'display-layout', 'Layout & spacing', '', 'sidebarLeft explorerVisible wideMode codeWidthPx wideExtraPx codeMinWidthPx sidePanelWidthPx sidePanelMinWidthPx findingsGutterPx chromeInsetPx chromeGapPx quickCodeOffsetPx'),
    fields('display', 'display-diffs', 'Diffs & typography', '', 'diffTheme diffStyle fileView fontSize uiFontSize uiLabelSize lineHeight'),
    fields('display', 'display-files', 'Files & headers', '', 'showCompletedFiles showFileFindings showFileComments showFileGitStatus showFileReviewed showFileIcons fileTreeDensity fileSort fileHeaderHeight fileHeaderPaddingLeft diffStatBoxes revisionBoxSize fileHeaderPadding fileCopyIconSize fileCopyButtonSize'),
    fields('display', 'display-findings', 'Findings & badges', '', 'weaponDisplay showResolved badgeSize badgeGap rangeBadgeScale markOverlayOpacity markFocusOpacity diffInlineMarkColor diffInlineMarkBorderWidthPx fileBadgePaddingPx'),
    fields('display', 'display-motion', 'Startup & feedback', '', 'showSplashScreen startupAnimation reducedMotion tooltipDelayMs tooltipSkipDelayMs uiMotionMs selectorCloseMs toastMs toastPosition dispatchPulseMs')
  ] },
  { id: 'gameplay', label: 'Game tuning', icon: Gamepad2, pages: [
    page('game-selection', 'Selection wheel', ''),
    fields('gameplay', 'game-navigation', 'Scrolling & completion', '', 'autoScroll autoAdvance advanceScrollMs advanceScrollDelayMs advanceScrollEasePower scrollPxPerSecond'),
    fields('gameplay', 'game-impacts', 'Hits & particles', '', 'hitLifetimeMs impactParticles impactRadiusPx impactGravity impactBounce impactDust impactLimit'),
    fields('gameplay', 'game-decals', 'Decals & erasing', '', 'decalLifetimeMs decalFadeMs decalLimit decalSizePx eraseIntervalMs'),
    fields('gameplay', 'game-audio', 'Audio & load state', '', 'sound adlibs volume reloadMs mainDrawn secondaryDrawn')
  ] },
  { id: 'weapons', label: 'Weapons', icon: Crosshair, pages: [
    page('weapon-loadout', 'Loadout & models', ''),
    fields('weapons', 'weapon-projectiles', 'Fire & projectiles', 'Individual profiles can override firing intervals.', 'mainFireIntervalMs secondaryFireIntervalMs mainProjectileSize secondaryProjectileSize mainProjectileWeight secondaryProjectileWeight muzzleFlashMs'),
    fields('weapons', 'weapon-aim', 'Aim & movement', '', 'scale sway bob fov aimDepth aimResponseMs mainModelYaw secondaryModelYaw'),
    fields('weapons', 'weapon-recoil', 'Recoil & holstering', '', 'mainRecoil secondaryRecoil recoilRecoveryMs recoilBuildUpMs maxRecoilTilt holsterStiffness holsterDamping holsterDrop holsterInward holsterPitch holsterYaw holsterRoll holsterCardLiftPx'),
    page('weapon-lighting', 'Lighting & atmosphere', ''),
    fields('weapons', 'weapon-rendering', 'Rendering & materials', '', 'preserveMaterials pixelRatio fps mainTint secondaryTint'),
    page('weapon-profiles', 'Individual profiles', 'Blank optional values inherit defaults.'),
    page('weapon-effects', 'Muzzle & debris effects', ''),
    page('weapon-models', 'Custom model library', '')
  ] },
  { id: 'gloves', label: 'Gloves', icon: Hand, pages: [
    fields('gloves', 'glove-lettering', 'Visibility & lettering', '', 'enabled mainText altText textColor'),
    fields('gloves', 'glove-lighting', 'Glow & pulse', '', 'glow glowColor glowIntensity pulse pulseColor pulseSeconds')
  ] },
  { id: 'targets', label: 'Targets', icon: Target, pages: [
    fields('display', 'target-placement', 'Size & placement', '', 'fileTargetSize fileTargetGutterPx fileTargetGapPx fileTargetOffsetX fileTargetOffsetY'),
    fields('targets', 'target-surface', 'Surface & glow', '', 'stoneColor carvingColor perspectivePx animationSamples depth roughness glowIntensity glowSpread glowMs'),
    fields('targets', 'target-motion', 'Float & hit animation', '', 'floatHeight floatPeriodMs sway hitTilt spinMs spinTurns spinEasePower hopHeight settlePauseMs fadeMs'),
    fields('targets', 'target-approach', 'Approach & hover', '', 'approachRadiusPx approachSampleMs approachConfirmMs approachConfidence approachReleaseMs approachIdleMs')
  ] },
  { id: 'destruction', label: 'Destruction', icon: Target, pages: [
    page('destruction-effects', 'Border & debris', '')
  ] },
  { id: 'adlibs', label: 'Ad-libs', icon: Volume2, pages: [
    page('adlibs-playback', 'Voice playback', ''),
    page('adlibs-clips', 'Voice clips', ''),
    page('adlibs-categories', 'Categories', '')
  ] },
  { id: 'events', label: 'Game events', icon: Gamepad2, pages: [
    page('events-rules', 'Trigger rules', 'Each rule can trigger a voice, portrait expression, or transmission.'),
    page('events-bench', 'Trigger test bench', ''),
    page('events-preview', 'Transmissions & queue', 'Shoot a message to dismiss it.'),
    fields('transmissions', 'events-layout', 'Placement & timing', '', 'enabled movement introSeconds outroSeconds widthPx bottomPx navigatorBottomPx')
  ] },
  { id: 'engine', label: 'Review engine', icon: Cpu, pages: [
    fields('review', 'engine-rendering', 'Diff rendering', '', 'contextLines expansionLines highlightWorkers highlightCacheEntries renderAheadPx virtualOverscanPx renderBatchSize virtualChunkLines'),
    fields('review', 'engine-history', 'History & tracking', 'Restart to apply server changes.', 'historyLimit versionLimit changeSettleMs includeUntracked'),
    fields('server', 'engine-server', 'Server & limits', 'Restart to apply server changes.', 'port pollMs heartbeatMs maxFileBytes maxDiffBytes maxFiles commitLimit gitTimeoutMs')
  ] }
];

export const tuningPages = studioGroups.flatMap(group => group.pages);
