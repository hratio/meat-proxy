import { defaultTargetArtwork, targetArtworks } from './targets/config';
import { z } from 'zod';
import { mergeDefaults, studioDefaults } from './tuning';
import { hudSchema } from './hud-config';
import { transmissionSchema } from './transmission-config';
import { uiDefaults } from './ui/defaults';
import { defaultShellTheme, shellThemeIds } from './ui/shell-themes';
import { totems, totemIndex, isTotemCharacter } from './totems';
import { weaponEffectsSchema, weaponProfileSchema, weaponProfiles } from './weapons/profiles';
import { weaponCatalog } from './weapons/catalog';
import { gloveSchema } from './gloves/config';
import { crosshairSchema } from './crosshair';
import { backgroundSchema } from './backgrounds/config';
import { weaponExposureSchema, weaponLightingSchema } from './weapons/lighting-config';
import { fileFilterPresetSchema } from './file-filter-presets';
import { destructionSchema } from './destruction/config';
import { destructionMarkSchema } from './destruction/completion';

// An empty binding explicitly disables a shortcut; missing entries keep defaults.
const key = z.string().max(40);
export const configSchema = z.object({
  experience: z.object({
    mode: z.enum(['game', 'review']).default('game').describe('Serious mode uses the violation wheel without weapons, game effects or audio.')
  }).prefault({}),
  fileFilters: z.object({ presets: z.array(fileFilterPresetSchema).default([]) }).prefault({}),
  destruction: destructionSchema.prefault({}),
  transmissions: transmissionSchema.prefault({}),
  server: z.object({
    port: z.number().int().min(1024).max(65535).default(6660),
    pollMs: z.number().int().min(300).max(60000).default(1800),
    heartbeatMs: z.number().int().min(1000).default(15000),
    maxFileBytes: z.number().int().min(1024).default(1048576),
    maxDiffBytes: z.number().int().min(1024).default(16777216),
    maxFiles: z.number().int().min(1).max(10000).default(500),
    commitLimit: z.number().int().min(1).max(500).default(40),
    gitTimeoutMs: z.number().int().min(1000).default(15000)
  }).prefault({}),
  review: z.object({
    contextLines: z.number().int().min(0).max(100).default(8),
    expansionLines: z.number().int().min(1).max(1000).default(20),
    highlightWorkers: z.number().int().min(1).max(8).default(2),
    highlightCacheEntries: z.number().int().min(1).max(500).default(40),
    renderAheadPx: z.number().int().min(200).max(5000).default(900),
    virtualOverscanPx: z.number().int().min(100).max(3000).default(500),
    renderBatchSize: z.number().int().min(1).max(10).default(1),
    virtualChunkLines: z.number().int().min(10).max(200).default(40),
    historyLimit: z.number().int().min(1).max(10000).default(500),
    versionLimit: z.number().int().min(2).max(1000).default(50),
    changeSettleMs: z.number().int().min(0).max(30000).default(600),
    includeUntracked: z.boolean().default(true)
  }).prefault({}),
  editor: z.object({
    enabled: z.boolean().default(true).describe('Show the open-in-editor button beside Copy path in diff headers.'),
    executable: z.string().trim().max(4096).refine(value => !/[\0\r\n]/.test(value), 'Enter a single executable name or path.').default('').describe('Editor executable name or full path, without arguments or quotes. Empty selects Visual Studio Code for the server OS.')
  }).prefault({}),
  display: z.object({
    background: backgroundSchema.prefault({}),
    shellTheme: z.enum(shellThemeIds).default(defaultShellTheme).describe('Interface palette. Independent of the diff syntax theme.'),
    customColors: z.boolean().default(false).describe('Apply personal tint and accent overrides to the shell theme.'),
    baseTint: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Personal surface tint, applied when custom colors are enabled.'),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Personal accent color, applied when custom colors are enabled.'),
    showSplashScreen: z.boolean().default(true),
    startupAnimation: z.boolean().default(true).describe('Raise the HUD, open the portrait shutter, then draw saved weapons after loading. Reduced motion skips this entrance.'),
    diffTheme: z.enum(['pierre-dark', 'github-dark', 'dracula', 'nord', 'tokyo-night', 'catppuccin-mocha', 'monokai', 'vitesse-dark', 'github-light']).default('pierre-dark'),
    diffStyle: z.enum(['unified', 'split']).default('unified'),
    fileView: z.enum(['single', 'all']).default('all'),
    showCompletedFiles: z.boolean().default(true),
    showFileFindings: z.boolean().default(true),
    showFileComments: z.boolean().default(true),
    showFileGitStatus: z.boolean().default(true),
    showFileReviewed: z.boolean().default(true),
    showFileIcons: z.boolean().default(true),
    fileTreeDensity: z.enum(['normal', 'dense']).default('normal'),
    fileSort: z.enum(['default', 'easy', 'hard']).default('default'),
    filePriorities: z.object({
      findings: z.boolean().default(false),
      comments: z.boolean().default(false),
      recentComments: z.boolean().default(false)
    }).prefault({}),
    quickCodeOffsetPx: z.number().int().min(0).max(80).default(16),
    sidebarLeft: z.boolean().default(true),
    explorerVisible: z.boolean().default(true),
    wideMode: z.boolean().default(true),
    codeWidthPx: z.number().int().min(600).max(2400).default(960),
    wideExtraPx: z.number().int().min(100).max(1200).default(320),
    codeMinWidthPx: z.number().int().min(320).max(1000).default(700),
    sidePanelWidthPx: z.number().int().min(220).max(600).default(320),
    sidePanelMinWidthPx: z.number().int().min(180).max(320).default(220),
    findingsGutterPx: z.number().int().min(32).max(240).default(64),
    fontSize: z.number().min(10).max(22).default(13),
    uiFontSize: z.number().min(12).max(20).default(14),
    uiLabelSize: z.number().min(11).max(18).default(12),
    tooltipDelayMs: z.number().int().min(0).max(3000).default(uiDefaults.tooltipDelayMs),
    tooltipSkipDelayMs: z.number().int().min(0).max(3000).default(uiDefaults.tooltipSkipDelayMs),
    uiMotionMs: z.number().int().min(0).max(1000).default(uiDefaults.uiMotionMs),
    fileHeaderHeight: z.number().int().min(36).max(72).default(46),
    fileHeaderPaddingLeft: z.number().int().min(0).max(40).default(10),
    diffStatBoxes: z.number().int().min(3).max(10).default(5),
    revisionBoxSize: z.number().int().min(10).max(24).default(14),
    fileHeaderPadding: z.number().int().min(4).max(40).default(18),
    fileCopyIconSize: z.number().int().min(14).max(26).default(17),
    fileCopyButtonSize: z.number().int().min(24).max(36).default(27),
    lineHeight: z.number().min(16).max(40).default(26),
    weaponDisplay: z.enum(['image', 'code']).default('image'),
    showResolved: z.boolean().default(true),
    reducedMotion: z.boolean().default(false),
    selectorCloseMs: z.number().int().min(0).default(850),
    toastMs: z.number().int().min(500).default(3500),
    toastPosition: z.enum(['bottom-left', 'bottom-right', 'top-left', 'top-right']).default('bottom-left'),
    badgeSize: z.number().int().min(16).max(36).default(24),
    badgeGap: z.number().int().min(1).max(12).default(3),
    rangeBadgeScale: z.number().min(1).max(2).default(2),
    markOverlayOpacity: z.number().min(0.03).max(0.3).default(0.1),
    markFocusOpacity: z.number().min(0.05).max(0.4).default(0.2),
    diffInlineMarkColor: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/).default('#ffd452').describe('Color and opacity of marked-range borders and the rail beside the diff indicators.'),
    diffInlineMarkBorderWidthPx: z.number().min(0).max(6).default(1).describe('Top and bottom border thickness for each continuous marked range. Set to 0 to keep only the rail.'),
    fileTargetSize: z.number().int().min(48).max(160).default(84),
    fileBadgePaddingPx: z.number().int().min(0).max(40).default(5).describe('Space between the code edge and both file and line finding badges.'),
    fileTargetGutterPx: z.number().int().min(0).max(200).default(50),
    fileTargetGapPx: z.number().int().min(0).max(80).default(10),
    fileTargetOffsetX: z.number().min(-160).max(160).default(0),
    fileTargetOffsetY: z.number().min(-160).max(160).default(0),
    dispatchPulseMs: z.number().int().min(1000).max(15000).default(3600),
    chromeInsetPx: z.number().int().min(8).max(48).default(24),
    chromeGapPx: z.number().int().min(4).max(40).default(16)
  }).prefault({}),
  hud: hudSchema.prefault({}),
  gloves: gloveSchema.prefault({}),
  crosshair: crosshairSchema.prefault({}),
  targets: z.object({
    artwork: z.enum(targetArtworks).default(defaultTargetArtwork),
    stoneColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#4c5055'),
    carvingColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#07090b'),
    perspectivePx: z.number().int().min(100).max(1200).default(360),
    animationSamples: z.number().int().min(16).max(120).default(64),
    depth: z.number().min(0.05).max(0.4).default(0.18),
    roughness: z.number().min(0).max(1).default(0.96),
    glowIntensity: z.number().min(0).max(8).default(2.4),
    glowSpread: z.number().min(0.02).max(0.4).default(0.14),
    glowMs: z.number().int().min(0).max(2000).default(200),
    floatHeight: z.number().min(0).max(0.3).default(0.07),
    floatPeriodMs: z.number().int().min(500).max(10000).default(2400),
    sway: z.number().min(0).max(0.6).default(0.16),
    approachRadiusPx: z.number().min(0).max(600).default(200).describe('Pointer-intent detection radius from the target center. Set to 0 for direct hover only.'),
    approachSampleMs: z.number().int().min(8).max(120).default(24).describe('Minimum interval between pointer trajectory samples.'),
    approachConfirmMs: z.number().int().min(0).max(500).default(48).describe('How long a likely approach must remain consistent before lighting the target.'),
    approachConfidence: z.number().min(0.5).max(0.99).default(0.78).describe('Heading confidence required to anticipate an approach. Higher values reject more indirect movement.'),
    approachReleaseMs: z.number().int().min(0).max(500).default(72).describe('How long a changed heading must persist before releasing anticipation.'),
    approachIdleMs: z.number().int().min(100).max(1000).default(180).describe('Release anticipation when the pointer stops short of the target.'),
    hitTilt: z.number().min(0).max(1).default(0.28),
    spinMs: z.number().int().min(200).max(5000).default(1250),
    spinTurns: z.number().int().min(1).max(6).default(2),
    spinEasePower: z.number().min(1).max(5).default(3),
    hopHeight: z.number().min(0).max(0.5).default(0.3),
    settlePauseMs: z.number().int().min(0).max(2000).default(200),
    fadeMs: z.number().int().min(0).max(2000).default(240)
  }).prefault({}),
  gameplay: z.object({
    autoScroll: z.boolean().default(false),
    autoAdvance: z.boolean().default(true),
    advanceScrollMs: z.number().int().min(0).max(3000).default(1000),
    advanceScrollDelayMs: z.number().int().min(0).max(1000).default(50),
    advanceScrollEasePower: z.number().min(1).max(8).default(5),
    scrollPxPerSecond: z.number().min(5).max(500).default(50),
    eraseIntervalMs: z.number().int().min(16).max(1000).default(50),
    hitLifetimeMs: z.number().int().min(50).max(3000).default(480),
    impactParticles: z.number().int().min(0).max(24).default(8),
    impactRadiusPx: z.number().min(10).max(150).default(46),
    impactGravity: z.number().min(100).max(3000).default(900),
    impactBounce: z.number().min(0).max(1).default(0.32),
    impactDust: z.number().int().min(0).max(12).default(4),
    impactLimit: z.number().int().min(10).max(300).default(48),
    decalLifetimeMs: z.number().int().min(500).max(120000).default(2000),
    decalFadeMs: z.number().int().min(100).max(10000).default(500),
    decalLimit: z.number().int().min(0).max(300).default(48),
    decalSizePx: z.number().min(4).max(80).default(22),
    reloadMs: z.number().int().min(100).max(5000).default(700),
    sound: z.boolean().default(true),
    adlibs: z.boolean().default(true),
    volume: z.number().min(0).max(1).default(0.18),
    mainDrawn: z.boolean().default(true),
    secondaryDrawn: z.boolean().default(false)
  }).prefault({}),
  weapons: z.object({
    profiles: z.record(z.string(), weaponProfileSchema).default(weaponProfiles),
    effects: weaponEffectsSchema.prefault({}),
    mainFireIntervalMs: z.number().int().min(40).max(2000).default(100),
    secondaryFireIntervalMs: z.number().int().min(40).max(2000).default(180),
    mainProjectileSize: z.number().min(0.25).max(4).default(1).describe('Bullet-hole diameter and destruction radius multiplier.'),
    secondaryProjectileSize: z.number().min(0.25).max(4).default(1.25).describe('Bullet-hole diameter and destruction radius multiplier.'),
    mainProjectileWeight: z.number().min(0.1).max(8).default(1).describe('Relative projectile weight; hole size scales with its square root.'),
    secondaryProjectileWeight: z.number().min(0.1).max(8).default(1.6).describe('Relative projectile weight; hole size scales with its square root.'),
    mainRecoil: z.number().min(0).max(1).default(0.22),
    secondaryRecoil: z.number().min(0).max(1).default(0.32),
    recoilRecoveryMs: z.number().int().min(50).max(2000).default(240),
    recoilBuildUpMs: z.number().int().min(100).max(5000).default(850),
    maxRecoilTilt: z.number().min(0).max(1).default(0.2),
    holsterStiffness: z.number().min(0.01).max(1).default(0.18),
    holsterDamping: z.number().min(0.1).max(1).default(0.65),
    holsterDrop: z.number().min(1).max(6).default(2.8),
    holsterInward: z.number().min(0).max(3).default(0.85),
    holsterPitch: z.number().min(0).max(3.14).default(0.9),
    holsterYaw: z.number().min(0).max(3.14).default(1.8),
    holsterRoll: z.number().min(0).max(3.14).default(0.35),
    holsterCardLiftPx: z.number().min(0).max(120).default(60),
    muzzleFlashMs: z.number().int().min(10).max(200).default(45),
    mainModel: z.string().default('/models/weapons/rhein-9.glb'),
    secondaryModel: z.string().default('/models/weapons/iron-verdict.glb'),
    preserveMaterials: z.boolean().default(true).describe('Keep the model’s authored colors and PBR materials.'),
    availableModels: z.array(z.object({
      name: z.string().trim().min(1).max(80),
      model: z.string().trim().min(1).max(1000)
    })).default([]),
    pixelRatio: z.number().min(0.5).max(2).default(1.5),
    fps: z.number().int().min(15).max(120).default(45),
    scale: z.number().min(0.1).max(3).default(1),
    sway: z.number().min(0).max(1).default(0.08),
    bob: z.number().min(0).max(1).default(0.018),
    fov: z.number().min(25).max(90).default(40),
    aimDepth: z.number().min(1).max(30).default(6),
    aimResponseMs: z.number().int().min(0).max(1000).default(80),
    mainModelYaw: z.number().min(-6.3).max(6.3).default(0),
    secondaryModelYaw: z.number().min(-6.3).max(6.3).default(0),
    mainTint: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#747b68'),
    secondaryTint: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#838674'),
    exposure: weaponExposureSchema,
    lighting: weaponLightingSchema.prefault({})
  }).prefault({}),
  bindings: z.object({
    mainGroupPrev: key.default('w'), mainGroupNext: key.default('s'),
    mainCodePrev: key.default('a'), mainCodeNext: key.default('d'),
    secondaryGroupPrev: key.default('shift+w'), secondaryGroupNext: key.default('shift+s'),
    secondaryCodePrev: key.default('shift+a'), secondaryCodeNext: key.default('shift+d'),
    mainToggle: key.default('g'), secondaryToggle: key.default('shift+g'),
    mainFire: key.default('mouse1'), secondaryFire: key.default('f'),
    erase: key.default('mouse3'), comment: key.default('t'), addVcode: key.default('v'),
    completeFile: key.default('space'),
    destroyFile: key.default('b'), destroyAll: key.default('shift+b'),
    toggleFile: key.default('c'),
    reload: key.default('r'), undo: key.default('z'), redo: key.default('y'),
    nextFile: key.default('j'), prevFile: key.default('k'),
    nextUnreviewed: key.default('n'),
    toggleScroll: key.default('p'), findings: key.transform(value => value.toLowerCase() === 'tab' ? 'i' : value).default('i')
  }).prefault({}),
  // Overrides let review shortcuts reuse dormant weapon keys without changing
  // the saved game controls. Missing entries inherit the shared binding.
  reviewBindings: z.object({
    erase: key.optional(), comment: key.optional(), addVcode: key.optional(), completeFile: key.optional(),
    toggleFile: key.optional(), undo: key.optional(), redo: key.optional(),
    nextFile: key.optional(), prevFile: key.optional(), nextUnreviewed: key.optional(),
    toggleScroll: key.optional(), findings: key.optional()
  }).prefault({}),
  onboarding: z.object({
    colorPickerUnlocked: z.boolean().default(false)
  }).prefault({}),
  dispatch: z.object({
    autoCopyInstructions: z.boolean().default(false).describe('Automatically copy agent instructions and skip the outbox dialog after dispatch. If copying fails, the dialog opens.')
  }).prefault({}),
  export: z.object({
    includeCatalog: z.boolean().default(true),
    includeExamples: z.boolean().default(true),
    includeResolved: z.boolean().default(false)
  }).prefault({})
});

export type Config = z.infer<typeof configSchema>;

// Only personal controls available in the interface belong in a personal
// config. The application and Studio continue to use the complete Config above.
export const userConfigSchema = z.object({
  experience: configSchema.shape.experience,
  destruction: destructionSchema.pick({ shotsToComplete: true, borderStyle: true }).prefault({}),
  fileFilters: configSchema.shape.fileFilters,
  display: configSchema.shape.display.unwrap().pick({
    background: true,
    shellTheme: true, customColors: true, baseTint: true, accent: true,
    showSplashScreen: true, diffTheme: true,
    diffStyle: true, fileView: true, showCompletedFiles: true,
    showFileFindings: true, showFileComments: true, showFileIcons: true,
    showFileGitStatus: true, showFileReviewed: true,
    fileTreeDensity: true, fileSort: true, filePriorities: true, sidebarLeft: true,
    explorerVisible: true, wideMode: true, fontSize: true, uiFontSize: true,
    uiLabelSize: true, lineHeight: true, weaponDisplay: true,
    showResolved: true, reducedMotion: true,
    toastMs: true, toastPosition: true, diffInlineMarkColor: true,
    diffInlineMarkBorderWidthPx: true
  }).prefault({}),
  hud: hudSchema.pick({
    titleSize: true, alwaysShowCode: true, codeWordWrap: true, tintStrength: true,
    navigatorEnabled: true, navigatorAlwaysVisible: true
  }).prefault({}),
  targets: configSchema.shape.targets.unwrap().pick({ artwork: true }).prefault({}),
  transmissions: transmissionSchema.pick({ enabled: true }).prefault({}),
  gameplay: configSchema.shape.gameplay.unwrap().pick({
    autoScroll: true, autoAdvance: true, scrollPxPerSecond: true,
    sound: true, adlibs: true, volume: true
  }).prefault({}),
  weapons: configSchema.shape.weapons.unwrap().pick({
    mainModel: true, secondaryModel: true
  }).prefault({}),
  editor: configSchema.shape.editor,
  gloves: configSchema.shape.gloves,
  crosshair: configSchema.shape.crosshair,
  bindings: configSchema.shape.bindings,
  reviewBindings: configSchema.shape.reviewBindings,
  onboarding: configSchema.shape.onboarding,
  dispatch: configSchema.shape.dispatch,
  export: configSchema.shape.export
});

export const defaults = configSchema.parse(mergeDefaults(configSchema.parse({}), studioDefaults.game));
// Personal preferences never come from shared Studio defaults.
defaults.experience.mode = 'game';
defaults.reviewBindings = {};
defaults.display.shellTheme = defaultShellTheme;
defaults.display.customColors = false;
defaults.display.background = backgroundSchema.parse({});
defaults.onboarding.colorPickerUnlocked = false;
defaults.dispatch.autoCopyInstructions = false;
defaults.crosshair = crosshairSchema.parse({});
defaults.editor = configSchema.shape.editor.parse({});
defaults.targets.artwork = defaultTargetArtwork;

// Validate sparse studio overrides without expanding them into a second copy of
// every default. Reject misspelled settings instead of silently saving dead knobs.
export function validateGameOverrides(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected game overrides.');
  // Accept older studio exports without restoring removed shell settings.
  const cleaned = structuredClone(input) as Record<string, unknown>;
  if (cleaned.display && typeof cleaned.display === 'object') {
    const display = cleaned.display as Record<string, unknown>;
    delete display.toolbarTravelPx;
    delete display.shellTheme;
    delete display.customColors;
    delete display.baseTint;
    delete display.accent;
    delete display.background;
  }
  if (cleaned.onboarding && typeof cleaned.onboarding === 'object') {
    delete (cleaned.onboarding as Record<string, unknown>).colorPickerUnlocked;
    delete (cleaned.onboarding as Record<string, unknown>).dispatchIntroSeen;
  }
  delete cleaned.dispatch;
  delete cleaned.crosshair;
  delete cleaned.editor;
  delete cleaned.experience;
  delete cleaned.reviewBindings;
  const base = configSchema.parse({});
  for (const [section, fields] of Object.entries(cleaned)) {
    if (!(section in base) || !fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error(`Unknown config section: ${section}`);
    for (const key of Object.keys(fields)) {
      if (!Object.hasOwn(base[section as keyof Config], key)) throw new Error(`Unknown config setting: ${section}.${key}`);
    }
  }
  configSchema.parse(mergeDefaults(base, cleaned));
  return cleaned;
}

const totemCharacterSchema = z.string().min(1).refine(isTotemCharacter, 'Enter one visible character.')
  .describe('One visible Unicode character (grapheme), including composed letters and emoji.');

export const weaponReferenceSchema = z.union([
  z.literal(weaponCatalog.map(weapon => weapon.weaponId)).describe(weaponCatalog.map(weapon => `${weapon.weaponId}: ${weapon.name}`).join('; ')),
  z.string().trim().min(1).max(1000).describe('Custom weapon model URL.')
]).describe('Stable built-in weapon ID or a custom model URL. Omit to inherit the group weapon or slot default.');

export const ruleFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(100),
  description: z.string().trim().min(1, 'Enter a description.').max(5000),
  severity: z.enum(['info', 'warning', 'critical']),
  image: z.union([z.number().int().min(0).max(totems.length - 1), totemCharacterSchema]),
  bad: z.string().max(10000).optional(),
  good: z.string().max(10000).optional(),
  weapon: weaponReferenceSchema.optional(),
  active: z.boolean().optional()
});
export const ruleSchema = ruleFieldsSchema.extend({ id: z.string().regex(/^V\d{3,6}$/) });
export const cannedResponseFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(100),
  content: z.string().trim().min(1, 'Enter a response.').max(20000),
  active: z.boolean().optional()
});
export const cannedResponseSchema = cannedResponseFieldsSchema.extend({ id: z.string().regex(/^C\d{3,6}$/) });
export const groupFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Enter a group name.').max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  weapon: weaponReferenceSchema.optional()
});

export const catalogSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(100),
  destructionMark: z.union([z.literal(''), destructionMarkSchema]).optional().describe('V-code or canned response ID added once at file level when destruction completes. Empty or omitted requires choosing a mark before entering destruction mode.'),
  groups: z.array(groupFieldsSchema.extend({
    id: z.string().min(1).max(60),
    codes: z.array(ruleSchema),
    responses: z.array(cannedResponseSchema).default([])
  })).min(1)
}).superRefine((catalog, ctx) => {
  const groups = catalog.groups.map(g => g.id);
  const codes = catalog.groups.flatMap(g => g.codes.map(c => c.id));
  const responses = catalog.groups.flatMap(g => g.responses.map(c => c.id));
  if (new Set(groups).size !== groups.length || new Set(codes).size !== codes.length || new Set(responses).size !== responses.length)
    ctx.addIssue({ code: 'custom', message: 'Group IDs, V-code IDs and canned response IDs must be unique.' });
});

export type Catalog = z.infer<typeof catalogSchema>;
export type Rule = Catalog['groups'][number]['codes'][number];
export type CannedResponse = z.infer<typeof cannedResponseSchema>;

// Read the retired 50-image catalog without breaking saved user rules. Authoring
// and the published schema use the current range; persisted imports are migrated.
export const catalogReadSchema = catalogSchema.safeExtend({
  groups: z.array(catalogSchema.shape.groups.element.extend({
    codes: z.array(ruleSchema.extend({
      image: z.union([z.number().int().min(0).max(Math.max(49, totems.length - 1)).transform(totemIndex), totemCharacterSchema])
    }))
  })).min(1)
});
