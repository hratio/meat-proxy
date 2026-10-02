<script lang="ts">
  import { isDemo, reviewFetch, subscribe, setReviewSession } from '$review-client';
  import { assetUrl } from '$lib/asset-url';
  import { createPointerHitTest, type PointerHit } from '$lib/ui/pointer-hit';
  import { mergeProps } from 'bits-ui';
  import { onMount, tick, untrack } from 'svelte';
  import { dev } from '$app/environment';
  import { Spring, prefersReducedMotion } from 'svelte/motion';
  import { toast } from '$lib/notifications';
  import { Virtualizer } from '@pierre/diffs';
  import { Crosshair, Settings as SettingsIcon, Radio, ListChecks, Layers3, BookOpen, AlertTriangle, Shield, MessageSquare } from '@lucide/svelte';
  import { defaults, type Config, type Catalog, type CannedResponse } from '$lib/config';
  import { appendCannedResponse } from '$lib/canned-responses';
  import CannedResponsePicker from '$lib/components/CannedResponsePicker.svelte';
  import type { Action, Aim, Bootstrap, DiffFile, Finding, Repository, SelectionInput, Snapshot, SnapshotMessage, TabletCelebration } from '$lib/types';
  import { hasLocation, rangeLabel, sameComparison } from '$lib/location';
  import { reconcileSnapshot, groupFindings } from '$lib/review-state';
  import { ReviewActions } from '$lib/review-actions';
  import { loadoutStorageKey, readLoadout, restoreSlot } from '$lib/loadout';
  import { createIntroduction, type IntroductionPhase } from '$lib/introduction/director';
  import { createIntroductionAim } from '$lib/introduction/aim';
  import { introductionCombat } from '$lib/introduction/combat';
  import type { DestructionCombat } from '$lib/destruction/model';
  import { introductionFile } from '$lib/introduction/config';
  import { createStartupSequence, type StartupPhase } from '$lib/startup';
  import { applySnapshotUpdate } from '$lib/snapshot-update';
  import { DiffCache } from '$lib/diff-cache';
  import { fileAtScrollPosition } from '$lib/scroll-position';
  import { leaveCompletedFile } from '$lib/file-completion-transition';
  import { activeBindings, commandAvailable } from '$lib/experience';
  import type { GameRuntime } from '$lib/game-runtime';
  import { gameEventDefaults } from '$lib/game-events/defaults';
  import type { GameRuleStatus } from '$lib/game-events/rules';
  import type { ActiveTransmission, GameEventsState, TransmissionDismissed } from '$lib/game-events/types';
  import Transmission from '$lib/components/Transmission.svelte';
  import FirstSteps from '$lib/components/FirstSteps.svelte';
  import TutorialGuide from '$lib/components/TutorialGuide.svelte';
  import DemoAgentTerminal from '$lib/components/DemoAgentTerminal.svelte';
  import type { TutorialDialogGuide } from '$lib/tutorial/content';
  import { tutorialFile } from '$lib/tutorial/flow';
  import { completionEvents, reviewSession } from '$lib/game-events/events';
  import type { GameEvent, ColorUnlockEvent } from '$lib/game-events/schema';
  import { weaponProfile } from '$lib/weapons/profiles';
  import { weaponModel } from '$lib/weapons/catalog';
  import { createWeaponCharge, type WeaponCharge } from '$lib/weapons/charge';
  import { isScrollbarAtPoint, isUiKeyboardEvent } from '$lib/ui/interaction';
  import { useCombat } from '$lib/ui/combat.svelte';
  import { activeCatalog, inactiveCodes, type CatalogAction, type CatalogChange } from '$lib/catalog-actions';
  import { arrangeFiles, fileExtension, type FileFilters, type FileSort } from '$lib/file-list';
  import type { FileFilterPreset } from '$lib/file-filter-presets';
  import { createPresetMatches } from '$lib/ui/file-presets.svelte';
  import { createFileSearch } from '$lib/ui/file-search.svelte';
  import ReviewViewOptions from '$lib/components/ReviewViewOptions.svelte';
  import ReviewToolsMenu from '$lib/components/ReviewToolsMenu.svelte';
  import ReviewComparison from '$lib/components/ReviewComparison.svelte';
  import AutoScroll from '$lib/components/AutoScroll.svelte';
  import QuickVcode from '$lib/components/armory/QuickVcode.svelte';
  import ViolationWheel from '$lib/components/ViolationWheel.svelte';
  import UiConfig from '$lib/components/UiConfig.svelte';
  import ReviewSelector from '$lib/components/ReviewSelector.svelte';
  import ReviewProgress from '$lib/components/ReviewProgress.svelte';
  import { findingProgress, reviewDelta } from '$lib/review-progress';
  import { dispatchScope, type DispatchSummary } from '$lib/dispatch';
  import FileNavigation from '$lib/components/FileNavigation.svelte';
  import FileExplorer from '$lib/components/FileExplorer.svelte';
  import FileExplorerPane from '$lib/components/FileExplorerPane.svelte';
  import { FilePatches } from '$lib/file-patches';
  import type { FileViewSelection, ReviewView } from '$lib/file-section-state';
  const filePatches = new FilePatches(64, 16 * 1024 * 1024, reviewFetch);
  import FileSlot from '$lib/components/FileSlot.svelte';
  import WeaponOverlay from '$lib/components/WeaponOverlay.svelte';
  import ImpactLayer from '$lib/components/ImpactLayer.svelte';
  import DestructionLayer from '$lib/components/DestructionLayer.svelte';
  import { provideDestruction } from '$lib/destruction/context';
  import { supportsDestruction } from '$lib/destruction/text';
  import { destructionRadius } from '$lib/destruction/holes';
  import { destructionMarkRequired, resolveDestructionMark } from '$lib/destruction/completion';
  import { mergeDefaults, studioDefaults } from '$lib/tuning';
  import GameHud from '$lib/components/hud/GameHud.svelte';
  import ArenaLogo from '$lib/components/ArenaLogo.svelte';
  import DemoInstall from '$lib/components/DemoInstall.svelte';
  import SplashScreen from '$lib/components/splash/Splash2Screen.svelte';
  import SceneBackdrop from '$lib/components/SceneBackdrop.svelte';
  import { useUi } from '$lib/ui/context.svelte';
  import Splash2Playback from '$lib/components/splash/Splash2Playback.svelte';
  import { defaultOpeningConfig as defaultSplash2Config } from '$lib/components/splash/opening-config';
  import { leaveSplash } from '$lib/components/splash/transition';
  import DispatchButton from '$lib/components/DispatchButton.svelte';
  import VImage from '$lib/components/VImage.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Hint from '$lib/components/Hint.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Toggle from '$lib/components/ui/toggle';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Label } from '$lib/components/ui/label';
  import Settings from '$lib/components/Settings.svelte';
  import Command from '$lib/components/armory/CatalogArmory.svelte';
  import Findings from '$lib/components/Findings.svelte';
  import HudAvatar from '$lib/components/HudAvatar.svelte';
  import { avatarDefaults, mergeAvatarPresentation, type AvatarPresentation } from '$lib/avatar/presentation';
  import { expressionNames, type AvatarPlayback, type AvatarRequest } from '$lib/avatar/playback';
  import type { AvatarLabOptions } from '$lib/avatar/preview';
  import DevPanel from '$dev-panel';
  import DevMenu from '$dev-menu';
  import DevCycle from '$dev-cycle';
  import type { StartupHandoff } from '$lib/startup-handoff';

  let { startup }: { startup?: StartupHandoff } = $props();

  const combat = useCombat();
  const ui = useUi();
  const destruction = provideDestruction();
  let quickCodePosition = $state<{ x: number; y: number }>();
  let filters = $state<FileFilters>({ excludedExtensions: [], showCompleted: false, showDeleted: true });
  let fileSort = $state<FileSort>('default');
  let filtersInitialized = false;
  let devOpen = $state(false);
  let transmissionExample = $state(false), transmissionExampleReady = $state(false);
  const transmissionExampleKey = 'meat-proxy:transmission-example:v1';
  onMount(() => {
    if (!dev) return;
    try { transmissionExample = localStorage.getItem(transmissionExampleKey) === 'true'; } catch { /* Storage may be disabled. */ }
    transmissionExampleReady = true;
  });
  $effect(() => {
    if (!dev || !transmissionExampleReady) return;
    try { localStorage.setItem(transmissionExampleKey, String(transmissionExample)); } catch { /* Keep the preview available for this session. */ }
  });
  let selectionWheel = $state(false);
  let lineSelection = $state<{ from: Aim; aim: Aim }>();
  let selectionPointer: number | undefined;
  let wheelPosition = $state<{ x: number; y: number }>();
  let wheelSession: string | undefined;
  let shiftHeld = $state(false);
  let avatar = $state<AvatarPresentation>(structuredClone(avatarDefaults));
  let avatarRequest = $state<AvatarRequest>();
  let avatarPlayback = $state<AvatarPlayback>();
  let avatarPuff = $state(0), avatarFlash = $state(0), avatarReset = $state(0);
  let avatarLab = $state<AvatarLabOptions>(mergeDefaults<AvatarLabOptions>({ clickCycle: true, paused: false, durationMs: 0, policy: 'queue', finishCycle: true }, studioDefaults.playback));

  function cycleAvatar() {
    if (!dev || !avatarLab.clickCycle) return;
    const index = expressionNames.indexOf(avatarRequest?.expression || 'Idle');
    avatarLab.paused = false;
    requestHud({ expression: expressionNames[(index + 1) % expressionNames.length], durationMs: avatarLab.durationMs || undefined, policy: avatarLab.policy, finishCycle: avatarLab.finishCycle, transition: { ...avatar.transitions } });
  }

  let data = $state<Bootstrap>();
  let snapshot = $state.raw<Snapshot>();
  let displayedFindings = $state.raw<Finding[]>([]);
  let resync: Promise<void> | undefined;
  const diffCache = new DiffCache();
  let config = $state<Config>();
  const gameEnabled = $derived(config?.experience.mode === 'game');
  $effect(() => { if (!gameEnabled) untrack(() => destruction.reset()); });
  // Capture the preference at startup. Later settings edits apply next visit.
  let showSplash = $state(false);
  const bindings = $derived(config ? activeBindings(config) : []);
  const shortcut = (command: string) => bindings.find(([name]) => name === command)?.[1] ?? '';
  // Lighting is updated in place; other weapon settings retain their rebuild behavior.
  const weaponRendererKey = $derived.by(() => {
    const { lighting, exposure, ...settings } = config?.weapons ?? defaults.weapons;
    return JSON.stringify(settings);
  });
  let catalog = $state<Catalog>();
  const destructionMark = $derived(resolveDestructionMark(catalog));
  $effect(() => {
    if (config && catalog && !destructionMark) untrack(() => {
      if (!destruction.active) return;
      stopTriggers(false);
      destruction.reset();
      notifyDestructionMark();
    });
  });
  let selected = $state('');
  let fileViews = $state<Record<string, DiffFile | undefined>>({});
  let findingHistory = $state<Record<string, { id: string; at: number }>>({});
  let reviewView = $state<ReviewView>('latest');
  // Keep only choices here; diff payloads still belong to windowed sections.
  let fileViewSelections = $state<Record<string, FileViewSelection>>({});
  const latestView: FileViewSelection = { kind: 'latest' };
  let defaultView = $derived<FileViewSelection>({ kind: reviewView });
  let hasLiveFiles = $derived(snapshot?.files.some(file => !!file.live));
  let comparisonOverrides = $derived(snapshot?.files.filter(file => !!file.live && !!fileViewSelections[file.path]).length || 0);
  function viewFor(path: string) { return fileViews[path] || snapshot?.files.find(file => file.path === path); }
  function updateFileView(path: string, file?: DiffFile) {
    fileViews[path] = file;
    if (destruction.view(path, file)) stopTriggers(false);
  }
  function chooseAllViews(kind: ReviewView) {
    stopTriggers(false); cancelAdvance(); aim = undefined;
    reviewView = kind;
    fileViewSelections = {};
    findingHistory = {};
  }
  function chooseFileView(path: string, selection: FileViewSelection) {
    if (selection.kind === reviewView) delete fileViewSelections[path];
    else fileViewSelections[path] = selection;
    delete findingHistory[path];
  }
  let loadingError = $state('');
  let splashComplete = $state(false), splashFailed = $state(false);
  let splashStarted = $state(false), startupVisible = $state(true), startupLeaving = $state(false);
  let splashImagesReady = $state(false), landscapeReady = $state(false), portraitReady = $state(false);
  let splashAudioReady = $state(false), splashAudioFinished = $state(false), openingTime = $state(0), sceneTime = $state(0);
  const arenaPrepared = $derived.by(() => !!data && !!config && !!catalog && !!snapshot
    && (!gameEnabled || ((!(primaryRule && primaryGroup && secondaryRule && otherGroup) || portraitReady)
      && weaponModelsReady[0] === mainModel && weaponModelsReady[1] === secondaryModel)));
  const splashPrepared = $derived(splashImagesReady && splashAudioReady && (!defaultSplash2Config.scene.enabled || landscapeReady) && arenaPrepared);
  let introductionPhase = $state<IntroductionPhase>('done');
  let introduction: ReturnType<typeof createIntroduction> | undefined;
  let introductionStarted = false;
  let introductionWeapons = $state(false);
  let introductionPointer = { x: 0, y: 0 };
  let introductionScroll = false;
  let introductionChecked = false;
  const introducing = $derived(introductionPhase !== 'done');
  const introductionControl = $derived(introducing && !startupVisible);

  function prepareIntroduction() {
    if (introductionChecked || !config || !snapshot) return;
    introductionChecked = true;
    const options = startup?.introduction;
    const file = snapshot.files.find(file => file.path === introductionFile);
    if (!isDemo || !options || !options.enabled || !gameEnabled || reducedStartupMotion
      || !file || snapshot.review.reviewed[file.path] === file.revision || !destructionMark || !supportsDestruction()) {
      startup?.onintroduction?.('done');
      return;
    }
    introductionPhase = 'preparing'; introductionWeapons = true;
    introductionPointer = { ...pointer }; introductionScroll = autoScroll; autoScroll = false;
    const introductionAim = createIntroductionAim();
    introduction = createIntroduction(options, {
      change: phase => {
        introductionPhase = phase; startup?.onintroduction?.(phase);
      },
      ready: () => !starting && !blocked && !stale && !!game,
      aim: progress => {
        const point = introductionAim(fileSections.get(introductionFile), progress, reviewCeiling + 24, innerHeight - hudClearance - 24);
        if (!point) return false;
        pointer = point; pointerInside = true; updatePointerContext(true);
        return !pointerNative && !pointerControl && pointerSurface?.closest<HTMLElement>('[data-file-path]')?.dataset.filePath === introductionFile;
      },
      fire: () => {
        const target = viewFor(introductionFile);
        if (!target || !config) { introduction?.cancel(); return; }
        const intervals = [
          weaponProfile(mainModel, config.weapons.profiles).fireIntervalMs ?? config.weapons.mainFireIntervalMs,
          weaponProfile(secondaryModel, config.weapons.profiles).fireIntervalMs ?? config.weapons.secondaryFireIntervalMs
        ];
        toggleFileDestruction(target, introductionCombat(config.destruction.shotsToComplete, options.firingMs, intervals));
        if (!destruction.target(target)) { introduction?.cancel(); return; }
        requestHud({ expression: 'Shout', durationMs: options.firingMs, policy: 'interrupt' });
        // Arming mounts the damage surface. Let that mount before either gun's
        // immediate first shot, so the calibrated hit budget starts on target.
        void tick().then(() => {
          if (introductionPhase !== 'firing') return;
          startTrigger('mainFire', 'intro-main', targetAtPointer());
          startTrigger('secondaryFire', 'intro-secondary', targetAtPointer());
        });
      },
      stop: () => stopTriggers(false),
      defeated: () => !!destruction.target(viewFor(introductionFile))?.finished
        || snapshot?.review.reviewed[introductionFile] === file.revision,
      completionFinished: () => snapshot?.review.reviewed[introductionFile] === file.revision
        && !fileCelebrations[introductionFile] && !operationPending,
      restore: () => { introductionWeapons = false; },
      restored: () => startupWeaponsReady && (!mainDrawn || mainHolster.current < .02),
      fadeMusic: () => startup?.onmusicend?.(),
      release: () => {
        stopTriggers(false); resetGameEvents(); destruction.reset(); impacts?.clear(); destructionEffects?.clear(); weaponOverlay?.clearEffects();
        pointer = { ...introductionPointer }; pointerInside = false;
        autoScroll = introductionScroll; aim = undefined; updatePointerContext(true);
        requestHud({ expression: 'Idle', policy: 'interrupt' });
      }
    });
    void tick().then(() => selectFile(introductionFile));
  }
  $effect(() => {
    if (!introducing || startupVisible || introductionStarted) return;
    untrack(() => {
      introductionStarted = true;
      introduction?.start();
    });
  });

  let landscapeActive = $state(false);
  // Wait for the saved preference before mounting or loading the scene.
  let landscapeVisible = $derived(landscapeActive && showSplash && defaultSplash2Config.scene.enabled);
  const background = $derived(ui.previewBackground ?? config?.display.background ?? defaults.display.background);
  let hudStartupPhase = $state<StartupPhase>('waiting');
  const hudStartup = createStartupSequence(phase => {
    hudStartupPhase = phase;
    window.dispatchEvent(new CustomEvent('meat-proxy:startup', { detail: { phase } }));
  });
  let splashBlocking = $derived(startupVisible || startupLeaving);
  let starting = $derived(splashBlocking || gameEnabled && hudStartupPhase !== 'ready');
  let reducedStartupMotion = $derived(!gameEnabled || config?.display.reducedMotion || prefersReducedMotion.current);
  let portraitStartup = $derived(hudStartupPhase === 'shutter' ? 'opening' as const
    : hudStartupPhase === 'weapons' || hudStartupPhase === 'ready' ? 'ready' as const : 'closed' as const);

  $effect(() => { startup?.onready(arenaPrepared); });
  $effect(() => { startup?.onplayable?.(!starting); });
  $effect(() => { if (config) startup?.onaudiochange?.(config.gameplay.sound, config.gameplay.volume); });
  $effect(() => { if (config) startup?.onbackgroundchange?.(background, config.display.reducedMotion); });
  $effect(() => { if (loadingError) startup?.onerror(loadingError); });
  $effect(() => { if (config) startup?.onintropreference?.(disableSplash); });

  $effect(() => {
    if (!config || startupVisible || startupLeaving) return;
    if (!gameEnabled || !config.display.startupAnimation || reducedStartupMotion || !primaryRule || !primaryGroup || !secondaryRule || !otherGroup) hudStartup.skip();
    else hudStartup.start(introducing);
  });

  function finishStartup() {
    startupLeaving = false;
  }

  $effect(() => {
    if (startup?.covered) return;
    if (!startupVisible || (!splashComplete && showSplash) || !data || !config || !catalog || !snapshot) return;
    if (showSplash && !arenaPrepared) return;
    // Let the arena mount and paint beneath the overlay before revealing it,
    // including when the user has disabled the opening artwork.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        startupLeaving = !startup; startupVisible = false;
        // The shared scene stays mounted until its opacity transition ends,
        // so it keeps moving throughout the handoff.
      });
    });
    return () => cancelAnimationFrame(frame);
  });
  let stale = $state(false);
  let settingsOpen = $state(false), commandOpen = $state(false), helpOpen = $state(false), findingsOpen = $state(false), dispatchOpen = $state(false);
  let tutorial = $state<FirstSteps>(), tutorialActive = $state(false);
  let tutorialFocus = $state<string>(), tutorialDialog = $state<TutorialDialogGuide>();
  const tutorialFileConfig = $derived(config ? { ...config, display: { ...config.display, showResolved: true } } : undefined);
  let settingsPanel = $state<Settings>();
  let dispatchPreferenceSaving = $state(false);
  let colorUnlockActive = $state(false);
  let pendingSelection = $state<{ selection: SelectionInput; reset: boolean }>();
  let switching = $state(false);
  let selectionReturnFocus: HTMLElement | null = null;
  let mainGroup = $state(0), secondaryGroup = $state(1);
  let mainIndices = $state<Record<string, number>>({}), secondaryIndices = $state<Record<string, number>>({});
  let mainDrawn = $state(true), secondaryDrawn = $state(false);
  let armed = $derived(gameEnabled && !selectionWheel && !starting && (mainDrawn || secondaryDrawn));
  let loadoutReady = $state(false);
  const mainHolster = new Spring(1), secondaryHolster = new Spring(1);
  let weaponModelsReady = $state(['', '']);
  let weaponsPresented = false;
  let mainShot = $state(-10000), secondaryShot = $state(-10000), reloadAt = $state(-10000);
  let mainShotCharge = $state(0), secondaryShotCharge = $state(0);
  let mainFiringSince = $state(-1), secondaryFiringSince = $state(-1);
  type Trigger = { input: string; strokeId: string; previous?: Aim } & ({ kind: 'fire'; secondary: boolean; code: string; charge?: WeaponCharge; completedTargets?: Set<string> } | { kind: 'erase'; deletedTargets?: Set<string> });
  const triggers = new Map<string, Trigger>();
  let heldCombat = $state(false);
  let arena = $state<HTMLDivElement>();
  let capturedPointer: number | undefined;
  const ownedButtons = new Set<number>();

  // Ownership is decided at trigger-down. Crossing UI never transfers an
  // accepted burst to a button; release/cancel ends it and consumes its click.
  function releaseCapture() {
    if (capturedPointer !== undefined && arena?.hasPointerCapture(capturedPointer)) arena.releasePointerCapture(capturedPointer);
    capturedPointer = undefined;
  }
  function blockNativeGesture(event: Event) {
    if (introductionControl) {
      if (!(event.target instanceof Element && event.target.closest('[data-intro-cancel]'))) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    if (heldCombat && event instanceof MouseEvent && event.type === 'mousedown') ownedButtons.add(event.button);
    const finalClick = event instanceof MouseEvent && (event.type === 'click' || event.type === 'auxclick');
    const owned = event instanceof MouseEvent && (finalClick ? ownedButtons.delete(event.button) : ownedButtons.has(event.button));
    if (heldCombat || owned) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function releaseMouseButtons(event: PointerEvent) {
    if (selectionPointer === event.pointerId && !(event.buttons & 1)) {
      updateLineSelection(targetAtPointer());
      selectionPointer = undefined;
      wheelPosition = { x: event.clientX, y: event.clientY };
    }
    // Pointerup only fires when the final mouse button is released. Chorded
    // releases arrive as pointermove, so reconcile against the complete mask.
    const masks = [1, 4, 2, 8, 16];
    for (const input of triggers.keys()) {
      if (input.startsWith('mouse') && !(event.buttons & masks[Number(input.slice(5)) - 1])) stopTrigger(input);
    }
    if (selectionPointer === undefined && ![...triggers.keys()].some(input => input.startsWith('mouse'))) releaseCapture();
  }
  $effect(() => {
    document.documentElement.dataset.combatHeld = String(gameEnabled && heldCombat);
    return () => { delete document.documentElement.dataset.combatHeld; };
  });
  let pointer = $state({ x: 0, y: 0 });
  let pointerNative = $state(false), pointerControl = $state(false), pointerInside = $state(true);
  let aim = $state<Aim>();
  // One delegated hit test also tracks the hovered file, including its folded header.
  let pointerSurface: Element | null = null;
  let hoveredFile: string | undefined;
  let logoDestroyed = $state(false);
  const logoSpace = new Spring(1, { stiffness: .12, damping: .52, precision: .001 });
  $effect(() => { void logoSpace.set(logoDestroyed && !isDemo ? 0 : 1, { instant: !gameEnabled || !!config?.display.reducedMotion || prefersReducedMotion.current }); });
  let impacts = $state<ImpactLayer>();
  let destructionEffects = $state<DestructionLayer>(), weaponOverlay = $state<WeaponOverlay>();
  let commentAim = $state<Aim>(), commentText = $state('');
  let commentInput = $state<HTMLTextAreaElement | null>(null);
  let scrollArea = $state<HTMLDivElement>();
  let scrollContentWidth = $state(0);
  let combatLayer = $state<HTMLDivElement>();
  let pageToolbar = $state<HTMLDivElement>();
  let toolbarWidth = $state(0);
  let findingsTrigger = $state<HTMLButtonElement | null>(null);
  let toolbarHeight = $state(44);
  let logoCenter = $state(22);
  let reviewCeiling = $derived((config?.display.chromeInsetPx || 0) + toolbarHeight + (config?.display.chromeGapPx || 0));
  let gutterCeiling = $derived.by(() => {
    const display = config?.display || defaults.display;
    const badgeSize = Math.min(display.badgeSize, display.lineHeight - 2);
    const badgeHeight = Math.max(badgeSize * display.rangeBadgeScale, badgeSize * 2 + display.badgeGap);
    const targetFloat = (config?.targets || defaults.targets).floatHeight * display.fileTargetSize / 2.5;
    // Targets float around the header's bottom edge.
    const overhang = Math.max(0,
      display.fileTargetSize / 2 + targetFloat - display.fileHeaderHeight - display.fileTargetOffsetY,
      (badgeHeight - display.fileHeaderHeight) / 2);
    // Keep the sticky icons whole, plus 4px of breathing room, then clip
    // outgoing headers before their icons can slide up beside the menu.
    return Math.max(0, reviewCeiling - overhang - 4);
  });
  let virtualizer = $state.raw<Virtualizer>();
  let virtualizerOptions = $derived(config ? JSON.stringify({ overscrollSize: config.review.virtualOverscanPx, intersectionObserverMargin: config.review.renderAheadPx }) : '');
  const fileSections = new Map<string, HTMLElement>();
  const toggleFiles = new Map<string, () => void>();
  const revealFiles = new Map<string, () => void>();
  let scrollFrame = 0, advanceFrame = 0;
  let advancing = false;
  type FileAdvance = { path: string; completion: boolean; redirected: boolean; done: Promise<void>; finish: () => void };
  let fileAdvance: FileAdvance | undefined;
  let autoScroll = $state(false);
  let dispatchPath = $state('');
  let dispatchedSummary = $state<DispatchSummary>({ findings: 0, files: 0, held: 0 });
  let demoDispatchId = $state(''), demoDispatchCount = $state(0), demoAgentRunning = $state(false);
  let demoDispatchPaths = $state<string[]>([]), demoAgentError = $state(''), demoAgentReviewed = $state('');
  let demoAgentResult = $state<{ resolved: number; changed: number }>();
  let demoTranscriptReady = $state(false);
  const demoAgentPhase = $derived(demoAgentRunning ? 'running' : demoAgentError ? 'error' : demoAgentResult ? demoTranscriptReady ? 'complete' : 'running' : 'idle');
  let findingsFilter = $state('open');
  let demoCommit = $state(false);
  let dispatching = $state(false);
  let operationPending = $state(0);
  let selectionBusy = $derived(switching || operationPending > 0);
  let inspectedFindingId = $state<string>();
  type FileCelebration = TabletCelebration & { reviewId: string; revision: string; confirmed: boolean; dismissing?: boolean; };
  let fileCelebrations = $state<Record<string, FileCelebration>>({});
  type FileTargetTimers = { fade?: ReturnType<typeof setTimeout>; done?: ReturnType<typeof setTimeout> };
  const fileTargetTimers = new Map<string, FileTargetTimers>();
  const completingFiles = new Set<string>();
  let navigationRevision = 0;
  let disconnect = () => {};
  let hiddenCodes = $derived(catalog ? inactiveCodes(catalog) : new Set<string>());
  let activeGroups = $derived(catalog ? activeCatalog(catalog).groups : []);
  let activeFindings = $derived(displayedFindings.filter(finding => !finding.code || !hiddenCodes.has(finding.code)));
  const presetMatches = createPresetMatches(() => ({
    paths: snapshot?.files.map(file => file.path) || [],
    presets: (config?.fileFilters.presets || []).filter(preset => filters.presetIds?.includes(preset.id))
  }));
  const fileSearch = createFileSearch(() => snapshot?.files.map(file => file.path) || [], beforeFileSearchChange);
  let orderedFiles = $derived(arrangeFiles(snapshot?.files || [], filters, fileSort, {
    priorities: config?.display.filePriorities, findings: activeFindings, presetPaths: presetMatches.paths
  }).filter(file => !fileSearch.paths || fileSearch.paths.has(file.path)));
  // Keep the file's space until its feedback and any advance scroll finish.
  let reviewFiles = $derived(orderedFiles.filter(file => filters.showCompleted || file.path === tutorialFocus || snapshot?.review.reviewed[file.path] !== file.revision || (!!fileCelebrations[file.path] && !fileCelebrations[file.path].dismissing)));
  let currentFile = $derived(reviewFiles.find(file => file.path === selected));
  let findingsProgress = $derived(findingProgress(activeFindings, snapshot?.review.dispatchedFindingIds));
  let displayedReviewed = $derived.by(() => {
    const reviewed = { ...snapshot?.review.reviewed };
    for (const [path, celebration] of Object.entries(fileCelebrations)) {
      if (celebration.reviewId === snapshot?.review.id) reviewed[path] = celebration.revision;
    }
    return reviewed;
  });
  let reviewedCount = $derived(snapshot?.files.filter(f => displayedReviewed[f.path] === f.revision).length || 0);
  let delta = $derived(reviewDelta(snapshot?.files || [], displayedReviewed));
  let hudClearance = $state(0);
  let hudNavigating = $state(false);
  let hudRailClearance = $state(0);
  let reviewComplete = $derived.by(() => {
    const current = snapshot;
    return !!current?.files.length && current.files.every(file => current.review.reviewed[file.path] === file.revision) && !current.warning;
  });
  let dispatchSummary = $derived(snapshot && catalog ? dispatchScope(snapshot.review, snapshot.files, catalog).summary : { findings: 0, files: 0, held: 0 });
  let openFindings = $derived(activeFindings.filter(f => f.status === 'open').length);
  let primaryGroup = $derived(activeGroups[mainGroup] || activeGroups[0]);
  let otherGroup = $derived(activeGroups[secondaryGroup] || activeGroups[0]);
  let primaryRule = $derived(primaryGroup?.codes[mainIndices[primaryGroup.id] || 0] || primaryGroup?.codes[0]);
  let secondaryRule = $derived(otherGroup?.codes[secondaryIndices[otherGroup.id] || 0] || otherGroup?.codes[0]);
  let mainModel = $derived(introductionWeapons ? '/models/weapons/flaky-assertions.glb' : weaponModel(primaryRule?.weapon ?? primaryGroup?.weapon) || config?.weapons.mainModel || '');
  let secondaryModel = $derived(introductionWeapons ? '/models/weapons/flaky-assertions.glb' : weaponModel(secondaryRule?.weapon ?? otherGroup?.weapon) || config?.weapons.secondaryModel || '');
  let startupWeaponsReady = $derived((!(introductionWeapons || mainDrawn) || weaponModelsReady[0] === mainModel)
    && (!(introductionWeapons || secondaryDrawn) || weaponModelsReady[1] === secondaryModel));
  let weaponsReleased = $derived(hudStartupPhase === 'ready' || hudStartupPhase === 'weapons' && startupWeaponsReady);
  let visibleMainDrawn = $derived(gameEnabled && !selectionWheel && weaponsReleased && (introductionWeapons || mainDrawn)), visibleSecondaryDrawn = $derived(gameEnabled && !selectionWheel && weaponsReleased && (introductionWeapons || secondaryDrawn));
  $effect(() => {
    if (isDemo || startup?.preview || !loadoutReady || !primaryGroup || !otherGroup || !primaryRule || !secondaryRule) return;
    const value = {
      primary: { group: primaryGroup.id, code: primaryRule.id, drawn: mainDrawn },
      secondary: { group: otherGroup.id, code: secondaryRule.id, drawn: secondaryDrawn }
    };
    try { localStorage.setItem(loadoutStorageKey, JSON.stringify(value)); } catch { /* Storage may be disabled. */ }
  });
  let game = $state.raw<GameRuntime>();
  const weaponAudio = $derived(game?.weaponAudio);
  const reviewAudio = $derived(game?.reviewAudio);
  const gameEvents = $derived(game?.events);
  let eventContent = $state(structuredClone(gameEventDefaults));
  let eventRuleStatus = $state<GameRuleStatus>({ counters: [] });
  let gameEventState = $state.raw<GameEventsState>({ queued: [] });
  // The persistent Studio sample stays out of the event queue and never plays speech.
  const exampleTransmission: ActiveTransmission = {
    id: -1, phase: 'covering', introMs: 0, outroMs: 0, durationMs: 600000,
    cue: { title: 'FILE CLEARED', text: "That function doesn't exist. Appreciate the confidence, though.",
      movement: false, portrait: { request: { expression: 'Idle' } } }
  };
  let exampleCovered = $state(false);
  let exampleExiting = $state(false);
  let transmissionPortraitReady = $state(false);
  let coveredTransmission = $state<number>();
  const activeTransmission = $derived(tutorialActive ? undefined : gameEventState.transmission ?? (dev && config && (transmissionExample || exampleExiting) && !starting
    ? { ...exampleTransmission, outroMs: config.transmissions.outroSeconds * 1000,
      phase: exampleExiting ? 'outro' as const : exampleCovered ? 'speaking' as const : 'covering' as const } : undefined));
  function setTransmissionExample(value: boolean) {
    exampleExiting = !value && activeTransmission?.id === exampleTransmission.id && activeTransmission.phase === 'speaking';
    transmissionExample = value;
  }
  function transmissionOutroComplete(id: number) {
    if (id === exampleTransmission.id) exampleExiting = false;
    else gameEvents?.transmissionFinished(id);
  }
  const hudCover = $derived(tutorialActive ? -2 : activeTransmission?.id);
  $effect(() => {
    if (hudCover !== exampleTransmission.id) { exampleCovered = false; exampleExiting = false; }
    if (coveredTransmission !== hudCover) coveredTransmission = undefined;
  });
  function transmissionCovered(id: number) { coveredTransmission = id; }
  $effect(() => {
    const transmission = activeTransmission;
    if (!transmissionPortraitReady || transmission?.phase !== 'covering' || coveredTransmission !== transmission.id) return;
    // A cold portrait must finish preparing before its short shutter entrance starts.
    untrack(() => {
      coveredTransmission = undefined;
      if (transmission.id === exampleTransmission.id) exampleCovered = true;
      else gameEvents?.hudCovered(transmission.id);
    });
  });
  let transmissionDismissed = $state<TransmissionDismissed>();
  $effect(() => {
    if (!gameEnabled) return;
    let current = true;
    let runtime: GameRuntime | undefined;
    void import('$lib/game-runtime').then(({ createGameRuntime }) => {
      if (!current) return;
      runtime = createGameRuntime({
        onchange: state => { if (current) gameEventState = state; },
        onrules: dev ? state => { if (current) eventRuleStatus = state; } : undefined,
        onerror: url => { if (current) toast.error(`Could not load game audio: ${url}`); },
        onreset: () => untrack(() => { avatarReset++; avatarRequest = undefined; avatarLab.paused = false; }),
        ondismiss: event => {
          if (!current) return;
          transmissionDismissed = event;
          window.dispatchEvent(new CustomEvent('meat-proxy:game-event', { detail: event }));
        }
      });
      game = runtime;
    }).catch(error => { if (current) toast.error(`Could not start game effects: ${String(error)}`); });
    return () => {
      current = false;
      untrack(() => {
        stopTriggers(false); releaseCapture(); ownedButtons.clear();
        runtime?.dispose(); game = undefined;
        gameEventState = { queued: [] };
        avatarRequest = undefined; transmissionDismissed = undefined; lastHudEvent = 0;
      });
    };
  });
  let lastHudEvent = 0;
  $effect(() => {
    const transmission = activeTransmission;
    // An arena without a mounted HUD has no second portrait to conceal.
    if (transmission?.phase === 'covering' && !(primaryRule && primaryGroup && secondaryRule && otherGroup)) {
      untrack(() => transmissionCovered(transmission.id));
    }
  });
  const hudPresentation = $derived(mergeAvatarPresentation($state.snapshot(avatar), gameEventState.hud?.cue.presentation));
  $effect(() => {
    const hud = gameEventState.hud;
    if (hud && hud.id !== lastHudEvent) {
      lastHudEvent = hud.id;
      avatarRequest = { ...hud.cue.request, id: hud.id, policy: 'queue' };
    }
  });
  function requestHud(request: AvatarRequest) {
    gameEvents?.play({ mode: request.policy === 'interrupt' ? 'immediate' : 'queue', priority: request.policy === 'interrupt' ? 10 : 0, hud: { request } });
  }
  function resetGameEvents() { gameEvents?.reset(); }
  $effect(() => {
    if (tutorialActive) untrack(() => { resetGameEvents(); autoScroll = false; stopTriggers(false); });
  });
  $effect(() => {
    const runtime = gameEvents;
    const settings = $state.snapshot(eventContent);
    untrack(() => { runtime?.configure(settings); void runtime?.preload(); });
  });
  $effect(() => {
    if (!config || !gameEvents) return;
    const runtime = gameEvents;
    const preferences = { sound: config.gameplay.sound, adlibs: config.gameplay.adlibs, volume: config.gameplay.volume,
      reducedMotion: config.display.reducedMotion || prefersReducedMotion.current, transmissions: { ...$state.snapshot(config.transmissions), enabled: config.transmissions.enabled && !introducing } };
    untrack(() => { runtime.preferences(preferences); void runtime.preload(); });
  });
  $effect(() => {
    if (!config || !game) return;
    // Profile/weapon changes also cancel echoes from a trigger already released.
    const profiles = [weaponProfile(mainModel, config.weapons.profiles), weaponProfile(secondaryModel, config.weapons.profiles)];
    untrack(() => stopTriggers(false));
    if (config.gameplay.sound && config.gameplay.volume) {
      void weaponAudio?.preload(profiles);
      void reviewAudio?.preload();
    }
  });
  let visibleFiles = $derived(config?.display.fileView === 'all' ? reviewFiles : currentFile ? [currentFile] : []);
  const noFindings: Finding[] = [];
  let findingsByFile = $state.raw(new Map<string, Finding[]>());
  let reactionsBlocked = $derived(combat.paused || !!quickCodePosition || starting || switching || commandOpen || helpOpen || !!pendingSelection || !!commentAim || dispatchOpen);
  let blocked = $derived(reactionsBlocked || colorUnlockActive);
  let combatCursor = $derived(gameEnabled && !selectionWheel && pointerInside && (!pointerNative || heldCombat) && !blocked && !stale && (mainDrawn || secondaryDrawn));
  function emitGameEvent(event: GameEvent | GameEvent[]) {
    if (gameEnabled && !blocked && !stale && !tutorialActive) gameEvents?.emit(event);
  }
  function colorUnlockEvent(type: ColorUnlockEvent) {
    gameEvents?.unlock();
    gameEvents?.emit({ type });
    window.dispatchEvent(new CustomEvent('meat-proxy:game-event', { detail: { type } }));
  }

  $effect(() => {
    const findings = activeFindings;
    // Catalog edits can hide findings without a new review snapshot. Reuse each
    // unchanged file's array so the diff cache keeps its update isolation.
    untrack(() => findingsByFile = groupFindings(findings, findingsByFile));
    if (inspectedFindingId && !findings.some(finding => finding.id === inspectedFindingId)) inspectedFindingId = undefined;
  });

  $effect(() => {
    if (blocked) { stopTriggers(false); cancelAdvance(); }
  });

  $effect(() => {
    const mode = config?.experience.mode;
    const wheel = selectionWheel;
    untrack(() => {
      closeLineSelection();
      if (wheel || mode === 'review') { stopTriggers(false); releaseCapture(); ownedButtons.clear(); }
      if (mode === 'review') {
        logoDestroyed = false; devOpen = false;
      }
    });
  });
  $effect(() => {
    const selected = lineSelection;
    if (!selected) return;
    const file = viewFor(selected.aim.path);
    if (stale || starting || switching || !file || snapshot?.review.reviewed[file.path] === file.revision
      || !visibleFiles.some(visible => visible.path === file.path)
      || wheelSession !== reviewSession(snapshot) || file.revision !== selected.aim.revision || !sameComparison(file.comparison, selected.aim.comparison)) untrack(closeLineSelection);
  });

  $effect(() => {
    if (presetMatches.pending) return;
    if (reviewFiles.some(file => file.path === selected)) return;
    const after = orderedFiles.findIndex(file => file.path === selected);
    const next = orderedFiles.slice(after + 1).find(file => reviewFiles.includes(file)) || reviewFiles[0];
    selected = next?.path || '';
    aim = undefined;
  });

  $effect(() => {
    const settings = config?.weapons || defaults.weapons;
    for (const spring of [mainHolster, secondaryHolster]) {
      spring.stiffness = settings.holsterStiffness;
      spring.damping = settings.holsterDamping;
    }
    const phase = hudStartupPhase, released = weaponsReleased;
    const instant = !released || reducedStartupMotion || (!weaponsPresented && phase === 'ready');
    if (released) weaponsPresented = true;
    let current = true;
    void Promise.all([
      mainHolster.set(visibleMainDrawn ? 0 : 1, { instant }),
      secondaryHolster.set(visibleSecondaryDrawn ? 0 : 1, { instant })
    ]).then(() => {
      if (current && released && phase === 'weapons') hudStartup.complete('weapons');
    }).catch(error => {
      // A new draw/holster target rejects the replaced spring's promise.
      if (!(error instanceof Error && error.message === 'Aborted')) throw error;
    });
    return () => { current = false; };
  });

  $effect(() => {
    if (!pageToolbar) return;
    const toolbar = pageToolbar;
    // Wrapped controls still set the shared ceiling for the sticky file headers.
    // Apply observer-driven layout changes on the next frame, outside the
    // current resize delivery, so the diff viewport can resize cleanly.
    let frame = 0;
    const measure = () => {
      toolbarWidth = toolbar.offsetWidth;
      toolbarHeight = toolbar.offsetHeight;
      // Align the wordmark to the first toolbar row even when later controls
      // wrap. The taller head is free to extend above that row.
      const anchor = [...toolbar.querySelectorAll('[data-ui-control]')].map(node => node.getBoundingClientRect())
        .filter(bounds => bounds.width > 0 && bounds.height > 0).sort((a, b) => a.top - b.top)[0];
      if (anchor) logoCenter = anchor.top + anchor.height / 2 - toolbar.getBoundingClientRect().top;
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); });
    observer.observe(toolbar);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  });

  $effect(() => {
    if (!scrollArea || !virtualizerOptions) return;
    const renderer = new Virtualizer(JSON.parse(virtualizerOptions));
    renderer.setup(scrollArea);
    virtualizer = renderer;
    return () => renderer.cleanUp();
  });

  async function api<T>(path: string, body?: unknown): Promise<T> {
    const response = await reviewFetch(`/api/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    return result;
  }

  function receiveCatalog(next: Catalog) {
    const mainId = primaryGroup?.id, secondaryId = otherGroup?.id;
    const mainCode = primaryRule?.id, secondaryCode = secondaryRule?.id;
    stopTriggers(false);
    catalog = next;
    const groups = activeCatalog(next).groups;
    mainGroup = Math.max(0, groups.findIndex(group => group.id === mainId));
    secondaryGroup = Math.max(0, groups.findIndex(group => group.id === secondaryId));
    for (const [index, code, indices] of [[mainGroup, mainCode, mainIndices], [secondaryGroup, secondaryCode, secondaryIndices]] as const) {
      const group = groups[index];
      if (group) indices[group.id] = Math.max(0, group.codes.findIndex(rule => rule.id === code));
    }
  }

  let catalogEdits = Promise.resolve();
  function editCatalog(action: CatalogAction) {
    const request = catalogEdits.then(async () => {
      const result = await api<CatalogChange>('catalog-action', action);
      receiveCatalog(result.catalog);
      if (action.type === 'create-code' && result.codeId) tutorial?.codeCreated(result.codeId);
      return result;
    });
    catalogEdits = request.then(() => {}, () => {});
    return request;
  }

  function filterFiles(value: FileFilters) {
    stopTriggers(false); cancelAdvance();
    const completedChanged = value.showCompleted !== filters.showCompleted;
    filters = value;
    if (completedChanged) void updateDisplay({ showCompletedFiles: value.showCompleted });
  }

  let searchScrollRestore: number | undefined;
  function beforeFileSearchChange(paths?: ReadonlySet<string>) {
    stopTriggers(false); cancelAdvance();
    autoScroll = false;
    const root = scrollArea;
    if (!root || config?.display.fileView !== 'all') return;
    const rootTop = root.getBoundingClientRect().top;
    const path = fileAtScrollPosition(reviewFiles, path => fileSections.get(path)?.getBoundingClientRect().bottom, rootTop + reviewCeiling);
    if (!path || (paths && !paths.has(path))) return;
    const slot = fileSections.get(path);
    if (!slot) return;
    const slotOffset = slot.getBoundingClientRect().top - rootTop;
    // Retain the visible diff line when available, with the offset within the
    // file as a fallback for binary files, placeholders or recycled diff rows.
    const lines = [...slot.querySelector('diffs-container')?.shadowRoot?.querySelectorAll<HTMLElement>('[data-line][data-line-index]') || []];
    const line = lines.find(node => node.getBoundingClientRect().top >= rootTop + reviewCeiling);
    const lineOffset = line ? line.getBoundingClientRect().top - rootTop : undefined;
    const revision = navigationRevision;
    searchScrollRestore = revision;
    cancelAnimationFrame(scrollFrame);
    selected = path;
    const restore = () => {
      if (searchScrollRestore !== revision || navigationRevision !== revision || scrollArea !== root || !slot.isConnected) return;
      const offset = line?.isConnected && lineOffset !== undefined
        ? line.getBoundingClientRect().top - root.getBoundingClientRect().top - lineOffset
        : slot.getBoundingClientRect().top - root.getBoundingClientRect().top - slotOffset;
      virtualizer?.markDOMDirty();
      if (virtualizer) virtualizer.scrollTo({ top: root.scrollTop + offset, behavior: 'instant' });
      else root.scrollTop += offset;
    };
    return () => {
      void tick().then(() => {
        restore();
        // Height reconciliation can follow the keyed list update by one frame.
        requestAnimationFrame(() => {
          restore();
          if (searchScrollRestore === revision) searchScrollRestore = undefined;
        });
      });
    };
  }

  async function saveFilePresets(presets: FileFilterPreset[]) {
    if (!config) return;
    config = await api<Config>('config', { ...$state.snapshot(config), fileFilters: { presets } });
    filterFiles({ ...filters, presetIds: filters.presetIds?.filter(id => presets.some(preset => preset.id === id)) });
  }

  function receive(next: Snapshot) {
    if (snapshot?.review.id === next.review.id && snapshot.review.createdAt > next.review.createdAt) return;
    if (snapshot?.review.id === next.review.id && snapshot.review.createdAt === next.review.createdAt && snapshot.review.revision > next.review.revision) return;
    if (snapshot?.review.id === next.review.id) {
      const resolved = next.review.findings.filter(f => f.status === 'resolved' && snapshot?.review.findings.some(old => old.id === f.id && old.status === 'open'));
      for (const f of resolved) toast.success(`${f.code || 'Comment'} resolved`, { description: f.resolution || `${f.path}:${rangeLabel(f)}`, duration: config?.display.toastMs });
    }
    if (snapshot?.review.id !== next.review.id || snapshot?.review.createdAt !== next.review.createdAt) { fileViews = {}; fileViewSelections = {}; findingHistory = {}; inspectedFindingId = undefined; diffCache.clear(); filePatches.clear(); }
    next = reconcileSnapshot(snapshot, next);
    stale = false;
    if (next === snapshot) return;
    const reactions = completionEvents(snapshot, next);
    if (reviewSession(snapshot) !== reviewSession(next)) resetGameEvents();
    if (destruction.sync(reviewSession(next) || '', next.files, next.review.reviewed)) stopTriggers(false);
    snapshot = next;
    setReviewSession(next.review);
    reviewActions.receive(next);
    if (reactions.length) emitGameEvent(reactions);
    for (const [path, celebration] of Object.entries(fileCelebrations)) {
      if (celebration.reviewId !== next.review.id || next.files.find(file => file.path === path)?.revision !== celebration.revision || (celebration.confirmed && next.review.reviewed[path] !== celebration.revision)) cancelCelebration(path);
    }
    // Selection must use the same filtered order as the rendered list and tree.
    if (!next.files.some(f => f.path === selected)) { selected = reviewFiles[0]?.path || ''; aim = undefined; }
  }

  async function receiveMessage(message: SnapshotMessage) {
    if (!('fromRevision' in message)) { receive(message); return; }
    // SSE and the response acknowledge the same mutation. Apply it once.
    if (snapshot?.review.id === message.review.id && snapshot.review.createdAt === message.review.createdAt && snapshot.review.revision >= message.review.revision) return;
    const next = snapshot && applySnapshotUpdate(snapshot, message);
    if (next) { receive(next); return; }
    // A reconnect or missed revision requires an authoritative baseline before
    // another delta can be applied. Never combine unrelated review versions.
    stale = true;
    resync ??= api<Snapshot>('snapshot?manifest=1').then(receive).finally(() => { resync = undefined; });
    await resync;
    // An update can arrive while the baseline request is already in flight.
    if (snapshot?.review.id === message.review.id && snapshot.review.createdAt === message.review.createdAt && snapshot.review.revision < message.review.revision) await receiveMessage(message);
  }

  async function load() {
    loadingError = '';
    if (!data || !config || !catalog || !snapshot) {
      splashComplete = false; splashFailed = false; splashStarted = false; startupVisible = true;
      landscapeActive = false;
    }
    try {
      data = await api<Bootstrap>('bootstrap?manifest=1'); config = data.config;
      if (startupVisible) {
        showSplash = !startup && config.experience.mode === 'game' && config.display.showSplashScreen;
        splashComplete = !showSplash;
        splashStarted = landscapeActive = showSplash;
      }
      receiveCatalog(data.catalog);
      if (!filtersInitialized) {
        filters = { excludedExtensions: [], showCompleted: config.display.showCompletedFiles, showDeleted: true };
        fileSort = config.display.fileSort;
        filtersInitialized = true;
      }
      if (!loadoutReady) {
        let saved;
        try { if (!isDemo && !startup?.preview) saved = readLoadout(localStorage.getItem(loadoutStorageKey)); } catch { /* Use configured defaults. */ }
        const main = restoreSlot(saved?.primary, activeGroups, 0, config.gameplay.mainDrawn);
        const secondary = restoreSlot(saved?.secondary, activeGroups, 1, config.gameplay.secondaryDrawn);
        mainGroup = main.group; secondaryGroup = secondary.group;
        if (activeGroups[main.group]) mainIndices[activeGroups[main.group].id] = main.code;
        if (activeGroups[secondary.group]) secondaryIndices[activeGroups[secondary.group].id] = secondary.code;
        mainDrawn = main.drawn; secondaryDrawn = secondary.drawn;
        loadoutReady = true;
      }
      autoScroll = config.gameplay.autoScroll;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) config.display.reducedMotion = true;
      // Bootstrap is reactive UI state; the review reducer needs plain values,
      // including saved finding rules that it clones when a mark is extended.
      receive($state.snapshot(data.snapshot)); loadingError = '';
      prepareIntroduction();
      disconnect(); filePatches.clear();
      disconnect = subscribe({
        snapshot: receive,
        update: message => { void receiveMessage(message).catch(error => { stale = true; toast.error(String(error), { id: 'live-error' }); }); },
        fault: message => { stale = true; toast.error(message, { id: 'live-error' }); },
        healthy: () => { stale = false; },
        disconnected: () => { stale = true; },
        settings: value => { config = value.config; receiveCatalog(value.catalog); }
      });
    } catch (e) { loadingError = e instanceof Error ? e.message : String(e); }
  }

  let pointerHits: ReturnType<typeof createPointerHitTest> | undefined;
  let lastPointerHit: PointerHit | undefined;
  onMount(() => {
    pointerHits = createPointerHitTest(() => pointer);
    pointer = { x: innerWidth / 2, y: innerHeight / 2 };
    void load();
    let raf = 0, previous = 0, scrollCarry = 0;
    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      const elapsed = previous ? Math.max(0, time - previous) : 0; previous = time;
      const delta = Math.min(elapsed / 1000, .05);
      gameEvents?.advance(elapsed);
      if (introductionControl && (stale || !gameEnabled)) introduction?.cancel();
      introduction?.setPaused(document.hidden);
      introduction?.update(time);
      updatePointerContext(heldCombat || !!gameEventState.transmission);
      if (blocked || stale || document.hidden && !introductionControl) stopTriggers(false);
      const target = targetAtPointer();
      if (!document.hidden) for (const trigger of triggers.values()) tickTrigger(trigger, target);
      if (autoScroll && !advancing && !blocked && !document.hidden && !stale && scrollArea && config) {
        scrollCarry += config.gameplay.scrollPxPerSecond * delta;
        const pixels = Math.trunc(scrollCarry);
        scrollArea.scrollTop += pixels;
        scrollCarry -= pixels;
      } else scrollCarry = 0;
    };
    raf = requestAnimationFrame(frame);
    const unload = (e: BeforeUnloadEvent) => { if (operationPending) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    const releasePointer = (event: PointerEvent) => {
      if (ownedButtons.has(event.button)) { event.preventDefault(); event.stopImmediatePropagation(); }
      if (selectionPointer === event.pointerId) { pointer = { x: event.clientX, y: event.clientY }; updatePointerContext(true); }
      releaseMouseButtons(event);
    };
    const releaseKeys = (event: KeyboardEvent) => { shiftHeld = event.shiftKey; stopTrigger(event.code); suppressBinding(event); };
    const blur = () => {
      shiftHeld = false; closeLineSelection(); releaseCapture(); cancelAdvance();
      // The intro owns its aim and triggers. Only physical input loses ownership
      // on blur, otherwise switching windows interrupts the scripted sequence.
      if (introductionControl) return;
      pointerInside = false; hoveredFile = undefined; stopTriggers(false);
    };
    const leave = (event: PointerEvent) => { if (introductionControl) return; if (!event.relatedTarget) { pointerInside = false; hoveredFile = undefined; } };
    const move = (event: PointerEvent) => { if (introductionControl) { introductionPointer = { x: event.clientX, y: event.clientY }; return; } pointerInside = true; pointer = { x: event.clientX, y: event.clientY }; updatePointerContext(true); releaseMouseButtons(event); aim = targetAtPointer(); if (selectionPointer === event.pointerId) updateLineSelection(aim); for (const trigger of triggers.values()) tickTrigger(trigger, aim); };
    const interruptScroll = () => { if (introductionControl) introduction?.cancel(); if (!blocked) { autoScroll = false; cancelAdvance(); } };
    const scrollKey = (event: KeyboardEvent) => { if (!isUiKeyboardEvent(event, combat.keyboardNavigation) && ['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key)) interruptScroll(); };
    window.addEventListener('wheel', interruptScroll, { passive: true, capture: true });
    window.addEventListener('touchmove', interruptScroll, { passive: true, capture: true });
    window.addEventListener('keydown', scrollKey, true);
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keyup', releaseKeys, true);
    window.addEventListener('keypress', suppressBinding, true);
    window.addEventListener('pointerup', releasePointer, true);
    window.addEventListener('pointercancel', blur, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerout', leave, true);
    window.addEventListener('pointerdown', pointerDown, true);
    const nativeEvents = ['click', 'auxclick', 'mousedown', 'mouseup', 'pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'dragstart'];
    for (const type of nativeEvents) window.addEventListener(type, blockNativeGesture, true);
    window.addEventListener('contextmenu', contextMenu, true);
    window.addEventListener('blur', blur);
    const visibility = () => { introduction?.setPaused(document.hidden); if (document.hidden) blur(); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      introduction?.dispose();
      pointerHits?.dispose(); pointerHits = undefined; lastPointerHit = undefined;
      stopTriggers(false); hudStartup.dispose(); releaseCapture(); cancelAdvance(); cancelAnimationFrame(raf); cancelAnimationFrame(scrollFrame); disconnect(); filePatches.clear(); window.removeEventListener('beforeunload', unload);
      for (const path of fileTargetTimers.keys()) cancelCelebration(path);
      window.removeEventListener('wheel', interruptScroll, true); window.removeEventListener('touchmove', interruptScroll, true); window.removeEventListener('keydown', scrollKey, true);
      window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', releaseKeys, true);
      window.removeEventListener('keypress', suppressBinding, true); window.removeEventListener('pointerup', releasePointer, true);
      window.removeEventListener('pointercancel', blur, true); window.removeEventListener('pointermove', move, true); window.removeEventListener('blur', blur);
      window.removeEventListener('pointerout', leave, true);
      for (const type of nativeEvents) window.removeEventListener(type, blockNativeGesture, true);
      window.removeEventListener('pointerdown', pointerDown, true); window.removeEventListener('contextmenu', contextMenu, true);
    };
  });

  const reviewActions = new ReviewActions({
    send: async (action, reviewId) => { await receiveMessage(await api<SnapshotMessage>('action?manifest=1', { action, reviewId })); },
    view: path => $state.snapshot(viewFor(path)),
    rows: file => diffCache.rows(file),
    rule: code => $state.snapshot(catalog?.groups.flatMap(group => group.codes).find(rule => rule.id === code)),
    change: (findings, pending) => { displayedFindings = findings; operationPending = pending; },
    error: error => toast.error(error instanceof Error ? error.message : String(error))
  });
  function act(action: Action): Promise<boolean> { return reviewActions.enqueue(action); }

  function updateLineSelection(target?: Aim) {
    const from = lineSelection?.from;
    if (from?.line && target?.line && from.path === target.path && from.revision === target.revision && sameComparison(from.comparison, target.comparison)) {
      lineSelection = { from, aim: { ...target } };
    }
  }
  function closeLineSelection() {
    lineSelection = undefined;
    wheelPosition = undefined;
    if (selectionPointer !== undefined) { selectionPointer = undefined; releaseCapture(); }
  }
  function openViolationWheel(selection: { from: Aim; aim: Aim }, position: { x: number; y: number }) {
    if (stale || starting || switching) return;
    autoScroll = false;
    cancelAdvance();
    wheelSession = reviewSession(snapshot);
    lineSelection = selection;
    wheelPosition = position;
  }
  function markSelectedLines(code: string) {
    const selection = lineSelection;
    if (selection && !stale && !switching && wheelSession === reviewSession(snapshot) && activeGroups.some(group => group.codes.some(rule => rule.id === code))) void act({ type: 'shoot', ...selection, code, strokeId: crypto.randomUUID() });
  }
  function registerFile(path: string, element: HTMLElement, reveal: () => void, toggle: () => void) {
    fileSections.set(path, element);
    revealFiles.set(path, reveal);
    toggleFiles.set(path, toggle);
    return () => { if (fileSections.get(path) === element) { fileSections.delete(path); revealFiles.delete(path); toggleFiles.delete(path); } };
  }
  function finishAdvance() {
    cancelAnimationFrame(advanceFrame);
    advanceFrame = 0; advancing = false;
    const current = fileAdvance;
    fileAdvance = undefined;
    current?.finish();
  }
  function cancelAdvance() {
    navigationRevision++;
    finishAdvance();
  }
  async function selectFile(path: string, smooth = false, preserveBurst = false) {
    // Consecutive completions share one navigation promise. Earlier files keep
    // their space until the final destination is reached or the user interrupts.
    const continuing = smooth && preserveBurst && fileAdvance?.completion ? fileAdvance : undefined;
    if (!continuing) cancelAdvance();
    const navigation = navigationRevision;
    let finish = () => {};
    const advance = continuing ?? { path, completion: smooth && preserveBurst, redirected: false, done: new Promise<void>(resolve => { finish = resolve; }), finish };
    fileAdvance = advance;
    advance.path = path;
    advance.redirected = !!continuing;
    if (!preserveBurst) stopTriggers();
    else for (const trigger of triggers.values()) trigger.previous = undefined;
    selected = path; aim = undefined;
    revealFiles.get(path)?.();
    if (continuing) return advance.done;
    await tick();
    if (navigation !== navigationRevision) return;
    if (!scrollArea) { finishAdvance(); return; }
    const destination = () => {
      if (config?.display.fileView !== 'all' || advance.path === reviewFiles[0]?.path) return 0;
      const element = fileSections.get(advance.path);
      const top = element ? scrollArea!.scrollTop + element.getBoundingClientRect().top - scrollArea!.getBoundingClientRect().top - reviewCeiling : scrollArea!.scrollTop;
      return Math.max(0, Math.min(top, scrollArea!.scrollHeight - scrollArea!.clientHeight));
    };
    const duration = config?.display.reducedMotion || prefersReducedMotion.current || config?.display.fileView !== 'all' ? 0 : config?.gameplay.advanceScrollMs || 0;
    if (!smooth || !duration) { virtualizer?.scrollTo({ top: destination() }); finishAdvance(); return; }
    advancing = true;
    autoScroll = false;
    let from = scrollArea.scrollTop;
    let started = performance.now() + (config?.gameplay.advanceScrollDelayMs || 0);
    let redirected = false;
    const power = config?.gameplay.advanceScrollEasePower || 5;
    const move = (now: number) => {
      if (navigation !== navigationRevision) return;
      if (blocked || document.hidden || !scrollArea) { cancelAdvance(); return; }
      if (advance.redirected) {
        from = scrollArea.scrollTop; started = now;
        redirected = true; advance.redirected = false;
      }
      if (now < started) { advanceFrame = requestAnimationFrame(move); return; }
      const t = Math.min(1, (now - started) / duration);
      // Start gently, but keep moving on a handoff instead of replaying the delay
      // and acceleration. Rebase at the current position to avoid a scroll jump.
      const eased = redirected ? 1 - Math.pow(1 - t, power)
        : t < .5 ? Math.pow(2 * t, power) / 2 : 1 - Math.pow(2 * (1 - t), power) / 2;
      virtualizer?.scrollTo({ top: from + (destination() - from) * eased });
      if (t < 1) advanceFrame = requestAnimationFrame(move);
      else finishAdvance();
    };
    advanceFrame = requestAnimationFrame(move);
    await advance.done;
  }
  function pageScrolled() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      aim = targetAtPointer();
      if (searchScrollRestore === navigationRevision) return;
      if (config?.display.fileView !== 'all') return;
      const path = fileAtScrollPosition(reviewFiles, path => fileSections.get(path)?.getBoundingClientRect().bottom, reviewCeiling);
      if (path !== undefined) selected = path;
    });
  }
  function moveFile(direction: number) {
    if (!reviewFiles.length || !scrollArea) return;
    autoScroll = false;
    const path = config?.display.fileView === 'all'
      ? fileAtScrollPosition(reviewFiles, path => fileSections.get(path)?.getBoundingClientRect().bottom, reviewCeiling) || selected
      : selected;
    const top = config?.display.fileView === 'all' ? fileSections.get(path)?.getBoundingClientRect().top : -scrollArea.scrollTop;
    const ceiling = config?.display.fileView === 'all' ? scrollArea.getBoundingClientRect().top + reviewCeiling : 0;
    if (direction < 0 && top !== undefined && top < ceiling - 2) { void selectFile(path); return; }
    const index = Math.max(0, reviewFiles.findIndex(file => file.path === path));
    void selectFile(reviewFiles[(index + direction + reviewFiles.length) % reviewFiles.length].path);
  }
  function nextUnreviewedPath(after: string) {
    if (!snapshot) return;
    const files = orderedFiles;
    const start = files.findIndex(file => file.path === after);
    for (let offset = 1; offset <= files.length; offset++) {
      const file = files[(start + offset) % files.length];
      if (file.path !== after && snapshot.review.reviewed[file.path] !== file.revision && !fileCelebrations[file.path]) return file.path;
    }
  }
  function moveToUnreviewed(after = selected) {
    const path = nextUnreviewedPath(after);
    if (path) void selectFile(path);
  }
  function cycle(secondary: boolean, groups: boolean, direction: number) {
    if (!activeGroups.length) return;
    const groupIndex = secondary ? secondaryGroup : mainGroup;
    if (groups) { const next = (groupIndex + direction + activeGroups.length) % activeGroups.length; if (secondary) secondaryGroup = next; else mainGroup = next; }
    else { const group = activeGroups[groupIndex] || activeGroups[0]; const indices = secondary ? secondaryIndices : mainIndices; indices[group.id] = ((indices[group.id] || 0) + direction + group.codes.length) % group.codes.length; }
  }
  function cycleFromHud(secondary: boolean, groups: boolean, direction: number) {
    if (blocked || stale || heldCombat) return;
    stopTriggers();
    cycle(secondary, groups, direction);
  }
  function sound(kind: Parameters<GameRuntime['playSound']>[0]) { if (gameEnabled && config?.gameplay.sound) game?.playSound(kind, config.gameplay.volume); }

  function updatePointerContext(force = false) {
    const hit = pointerHits?.read(force);
    if (!hit || hit === lastPointerHit) return;
    lastPointerHit = hit;
    const node = pointerSurface = hit.surface;
    hoveredFile = pointerInside ? node?.closest<HTMLElement>('[data-file-path]')?.dataset.filePath : undefined;
    pointerNative = !!node?.closest('[data-cursor="native"], [data-sonner-toaster], dialog, input, textarea, select');
    if (scrollArea && (node === scrollArea || !node)) {
      const rect = scrollArea.getBoundingClientRect();
      pointerNative ||= pointer.x >= rect.left + scrollArea.clientWidth && pointer.x < rect.right && pointer.y >= rect.top && pointer.y < rect.bottom;
    }
    pointerControl = !!node?.closest('button, a, [role="button"], [data-file-badge-panel]') && !node?.closest('.file-hitbox, .file-target');
    for (const inner of hit.path.slice(1)) {
      const control = !!inner.closest('button, a, [role="button"], [data-expand-button], [data-unmodified-lines]');
      pointerControl ||= control; pointerNative ||= control;
    }
    pointerNative ||= isScrollbarAtPoint(hit.inner, pointer.x, pointer.y);
  }

  function targetAtPointer(): Aim | undefined {
    updatePointerContext();
    const surface = lastPointerHit?.surface, node = lastPointerHit?.inner;
    if (surface?.closest('[data-cursor="native"], .range-badge, [data-file-badge-panel], [data-reviewed="true"]')) return;
    const path = surface?.closest<HTMLElement>('[data-file-path]')?.dataset.filePath;
    if (!path) return;
    const view = viewFor(path);
    if (!view || view.comparison?.kind === 'history') return;
    const location = { path, revision: view.revision, comparison: view.comparison };
    if (node?.closest('[data-expand-button], [data-unmodified-lines]')) return;
    const line = node?.closest<HTMLElement>('[data-line], [data-column-number]');
    if (line) return { ...location, line: Number(line.dataset.line || line.dataset.columnNumber), side: line.closest('[data-deletions]') || line.dataset.lineType === 'change-deletion' ? 'deletions' : 'additions' };
    if (node?.closest('.diff-file-header')) return location;
  }

  function startTrigger(command: 'mainFire' | 'secondaryFire' | 'erase', input: string, target?: Aim) {
    const erasingBadge = command === 'erase' && !!pointerSurface?.closest('.range-badge');
    if ((command !== 'erase' && (!gameEnabled || !game || selectionWheel)) || !config || triggers.has(input) || blocked || stale || (!heldCombat && (pointerNative || (pointerControl && !erasingBadge)))) return;
    const base = { input, strokeId: crypto.randomUUID() };
    let trigger: Trigger;
    if (command === 'erase') {
      trigger = { ...base, kind: 'erase' };
      if (config.gameplay.sound && config.gameplay.volume) reviewAudio?.unlock();
    }
    else {
      const secondary = command === 'secondaryFire';
      if (!introductionWeapons && (secondary ? !secondaryDrawn : !mainDrawn)) return;
      if ([...triggers.values()].some(held => held.kind === 'fire' && held.secondary === secondary)) return;
      const rule = secondary ? secondaryRule : primaryRule;
      if (!rule) return;
      const profile = weaponProfile(secondary ? secondaryModel : mainModel, config.weapons.profiles);
      const since = performance.now();
      trigger = { ...base, kind: 'fire', secondary, code: rule.id, charge: profile.effect === 'plasma' ? createWeaponCharge(profile, since) : undefined };
      weaponAudio?.begin(secondary ? 1 : 0, profile, config.gameplay.sound ? config.gameplay.volume : 0);
      if (secondary) secondaryFiringSince = since; else mainFiringSince = since;
    }
    triggers.set(input, trigger);
    heldCombat = true;
    tickTrigger(trigger, target);
  }

  function stopTrigger(input: string, flush = true) {
    const trigger = triggers.get(input);
    if (!trigger) return;
    // Remove ownership before final actions can synchronously change the UI.
    triggers.delete(input);
    if (flush) tickTrigger(trigger, targetAtPointer(), true);
    else if (trigger.kind === 'fire') trigger.charge?.cancel();
    heldCombat = triggers.size > 0;
    if (trigger.kind === 'fire') { weaponAudio?.end(trigger.secondary ? 1 : 0, flush); if (trigger.secondary) secondaryFiringSince = -1; else mainFiringSince = -1; }
    else reviewAudio?.endErase(input, flush);
  }
  function stopTriggers(flush = true) {
    // Navigation, reload and holstering cancel a charge. Only an actual input
    // release discharges it; normal weapons still flush their review stroke.
    for (const [input, trigger] of triggers) stopTrigger(input, flush && !(trigger.kind === 'fire' && trigger.charge));
    if (!flush) { weaponAudio?.end(0, false); weaponAudio?.end(1, false); reviewAudio?.cancel(); }
  }

  function sweepTarget(trigger: Trigger, target: Aim) {
    const previous = trigger.previous;
    const connect = previous?.line && target.line && previous.path === target.path && previous.revision === target.revision && previous.comparison?.base === target.comparison?.base;
    trigger.previous = { ...target };
    return { aim: { ...target }, ...(connect ? { from: { ...previous } } : {}), strokeId: trigger.strokeId };
  }

  function tickTrigger(trigger: Trigger, target?: Aim, finishing = false) {
    if ((!gameEnabled && trigger.kind === 'fire') || !config || blocked || stale) return;
    if (pointerSurface?.closest('[data-shoot-transmission]')) {
      trigger.previous = undefined;
      if (trigger.kind === 'fire') tickWeaponShot(trigger, undefined, finishing);
      return;
    }
    if (pointerNative || pointerControl) target = undefined;
    if (trigger.input.startsWith('intro-') && destructionAtPointer()?.path !== introductionFile) return;
    if (destructionAtPointer()) {
      // Crossing between play and review must never bridge a review stroke.
      trigger.previous = undefined;
      if (trigger.kind === 'fire') tickWeaponShot(trigger, target, finishing);
      return;
    }
    const same = target && trigger.previous?.path === target.path && trigger.previous?.revision === target.revision
      && trigger.previous?.side === target.side && trigger.previous?.line === target.line;
    if (!target) trigger.previous = undefined;
    if (trigger.kind === 'erase') {
      // Badges are controls, but a held erase gesture owns them just like lines.
      const id = !pointerNative ? pointerSurface?.closest<HTMLElement>('.range-badge[data-finding-id]')?.dataset.findingId : undefined;
      if (id && !trigger.deletedTargets?.has(id)) {
        (trigger.deletedTargets ||= new Set()).add(id);
        if (config.gameplay.sound) reviewAudio?.beginErase(trigger.input, config.gameplay.volume);
        void act({ type: 'delete', id });
      } else if (target && !same) {
        if (config.gameplay.sound) reviewAudio?.beginErase(trigger.input, config.gameplay.volume);
        void act({ type: 'erase', ...sweepTarget(trigger, target) });
      }
      return;
    }
    if (trigger.secondary ? !secondaryDrawn : !mainDrawn) return;
    // Review operations follow press/drag immediately, including while charging.
    // Charge/release, cooldown and reload only schedule visual/audio effects.
    if (!pointerNative && !pointerControl) {
      const fileTarget = pointerSurface?.closest<HTMLElement>('[data-complete-file]')?.dataset.completeFile;
      if (fileTarget && !trigger.completedTargets?.has(fileTarget)) {
        (trigger.completedTargets ||= new Set()).add(fileTarget);
        trigger.previous = undefined;
        void completeFile(fileTarget);
      } else if (target && !same) void act({ type: 'shoot', code: trigger.code, ...sweepTarget(trigger, target) });
    }
    tickWeaponShot(trigger, target, finishing);
  }

  // Cosmetic firing has its own schedule. It never gates diff selection.
  function tickWeaponShot(trigger: Extract<Trigger, { kind: 'fire' }>, target?: Aim, finishing = false) {
    if (trigger.charge) {
      if (!finishing) return;
      const charge = trigger.charge.release(performance.now());
      if (charge !== undefined) fireShot(trigger, target, charge);
    } else if (!finishing) fireShot(trigger, target);
  }

  function fireShot(trigger: Extract<Trigger, { kind: 'fire' }>, target?: Aim, charge = 0) {
    if (!gameEnabled || !config || pointerNative || pointerControl) return;
    const secondary = trigger.secondary, time = performance.now();
    const profile = weaponProfile(secondary ? secondaryModel : mainModel, config.weapons.profiles);
    const interval = profile.fireIntervalMs ?? (secondary ? config.weapons.secondaryFireIntervalMs : config.weapons.mainFireIntervalMs);
    if (time - (secondary ? secondaryShot : mainShot) < interval || time - reloadAt < config.gameplay.reloadMs) return;
    if (secondary) { secondaryShotCharge = charge; secondaryShot = time; }
    else { mainShotCharge = charge; mainShot = time; }
    weaponAudio?.shot(secondary ? 1 : 0, !!trigger.charge);
    const doomed = destructionAtPointer();
    if (doomed) {
      const radius = destructionRadius(profile,
        secondary ? config.weapons.secondaryProjectileSize : config.weapons.mainProjectileSize,
        secondary ? config.weapons.secondaryProjectileWeight : config.weapons.mainProjectileWeight, charge);
      const shot = destruction.shoot(doomed, target || {}, pointer, secondary ? secondaryModel : mainModel, profile.effect, charge, config.destruction.shotsToComplete, radius);
      impacts?.fire(pointer.x, pointer.y, true, secondary);
      emitGameEvent({ type: 'shot', weapon: secondary ? secondaryModel : mainModel, background: false });
      if (shot?.complete) {
        stopTriggers(false);
        void completeFile(doomed.path).finally(() => {
          if (snapshot?.review.reviewed[doomed.path] !== doomed.revision) {
            destruction.retryCompletion(doomed);
            if (introductionControl && doomed.path === introductionFile) introduction?.cancel();
          }
        });
      }
      return;
    }
    const surface = pointerSurface;
    const transmissionId = surface?.closest<HTMLElement>('[data-shoot-transmission]')?.dataset.shootTransmission;
    if (transmissionId) { gameEvents?.shoot(Number(transmissionId), { ...pointer }); return; }
    if (surface?.closest('[data-shoot-logo]')) logoDestroyed = true;
    const background = !!surface && !target && !surface.closest('.review-file, button, a, [data-cursor="native"], input, textarea, select');
    impacts?.fire(pointer.x, pointer.y, !surface?.closest('.review-file, button, a, [data-cursor="native"]'), secondary);
    emitGameEvent({ type: 'shot', weapon: secondary ? secondaryModel : mainModel, background });
  }

  function binding(event: KeyboardEvent | MouseEvent) {
    const key = 'key' in event ? event.key === ' ' ? 'space' : event.key.toLowerCase() : `mouse${event.button + 1}`;
    return [event.ctrlKey ? 'ctrl' : '', event.altKey ? 'alt' : '', event.metaKey ? 'meta' : '', event.shiftKey ? 'shift' : '', key].filter(Boolean).join('+');
  }

  function destructionAtPointer() {
    if (!gameEnabled || pointerNative || pointerControl) return;
    const path = pointerSurface?.closest<HTMLElement>('[data-file-path]')?.dataset.filePath;
    const file = path ? viewFor(path) : undefined;
    return destruction.target(file) ? file : undefined;
  }

  function notifyDestructionMark() {
    toast('Destruction needs a completion mark', { id: 'destruction-mark', description: destructionMarkRequired });
  }
  function canEnterDestruction() {
    if (destructionMark) return true;
    notifyDestructionMark();
    return false;
  }
  function toggleFileDestruction(file: DiffFile, combat?: DestructionCombat) {
    if (!gameEnabled || blocked || stale || fileCelebrations[file.path] || file.comparison?.kind === 'history') return;
    if (!supportsDestruction()) { toast('Character destruction requires a browser with CSS text highlights.'); return; }
    stopTriggers(false);
    if (destruction.target(file) || canEnterDestruction()) {
      closeLineSelection();
      if (destruction.toggle(file, combat)) emitGameEvent({ type: 'destruction-file-start' });
    }
  }

  function pointerDown(event: PointerEvent) {
    if (introductionControl) {
      if (!(event.target instanceof Element && event.target.closest('[data-intro-cancel]'))) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    combat.keyboardNavigation = false;
    shiftHeld = event.shiftKey;
    if (heldCombat) {
      ownedButtons.add(event.button);
      event.preventDefault(); event.stopImmediatePropagation();
    } else ownedButtons.delete(event.button);
    cancelAdvance();
    if (!config || blocked || stale) return;
    pointer = { x: event.clientX, y: event.clientY };
    pointerInside = true;
    updatePointerContext(true);
    if (pointerNative && !heldCombat) return;
    const elements = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement);
    if (!heldCombat && elements.some(node => node.matches('input, textarea, select, [contenteditable="true"]'))) return;
    const completed = elements.find(node => node.matches('.file-container[data-completed="true"]'));
    if (gameEnabled && completed && event.button === 0 && !heldCombat) {
      event.preventDefault();
      stopTriggers(false);
      const path = completed.closest<HTMLElement>('[data-file-path]')?.dataset.filePath;
      if (path) void reopenFile(path);
      return;
    }
    const command = bindings.find(([, value]) => value === binding(event))?.[0];
    const erasingBadge = command === 'erase' && elements.some(node => node.matches('.range-badge'));
    const hitbox = erasingBadge || elements.some(node => node.matches('.file-hitbox, .diff-file-header, .file-target, diffs-container'));
    const control = !hitbox && elements.some(node => node.matches('button, a, [role="button"]'));
    if (control && !heldCombat) return;
    const target = targetAtPointer();
    aim = target;
    if ((selectionWheel || !gameEnabled) && command !== 'erase') {
      if (event.button === 0 && target) {
        wheelSession = reviewSession(snapshot);
        lineSelection = { from: { ...target }, aim: { ...target } };
        selectionPointer = event.pointerId;
        autoScroll = false;
        ownedButtons.add(event.button);
        event.preventDefault(); event.stopImmediatePropagation();
        capturedPointer = event.pointerId;
        arena?.setPointerCapture(event.pointerId);
      } else if (!gameEnabled && command && !control) { event.preventDefault(); perform(command, target); }
      return;
    }
    if (command) {
      if (!control) {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }
      if (command === 'mainFire' || command === 'secondaryFire' || command === 'erase') {
        const input = `mouse${event.button + 1}`;
        startTrigger(command, input, target);
        if (triggers.has(input)) {
          ownedButtons.add(event.button);
          event.preventDefault(); event.stopImmediatePropagation();
          capturedPointer = event.pointerId;
          arena?.setPointerCapture(event.pointerId);
        }
      }
      else if (!control) perform(command, target);
    }
  }

  function contextMenu(event: MouseEvent) {
    if (heldCombat || ownedButtons.has(event.button)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (blocked || !config) return;
    const node = event.target;
    if (node instanceof HTMLElement && node.closest('input, textarea, select, a')) return;
    if (bindings.some(([, key]) => key === binding(event))) event.preventDefault();
  }

  async function startComment(target = aim) {
    if (!target || stale) { toast(gameEnabled ? 'Aim at a line or file first.' : 'Select a line or file first.'); return; }
    commentAim = { ...target }; commentText = ''; await tick(); commentInput?.focus();
  }
  async function submitComment() { if (!commentAim || !commentText.trim() || operationPending) return; if (await act({ type: 'comment', aim: commentAim, comment: commentText })) { commentAim = undefined; toast.success('Comment added'); } }
  async function insertCommentResponse(response: CannedResponse) {
    try {
      commentText = appendCannedResponse(commentText, response.content);
      await tick(); commentInput?.focus();
      commentInput?.setSelectionRange(commentText.length, commentText.length);
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
  }

  function perform(command: string, target = targetAtPointer()) {
    if (!config || !commandAvailable(command, config.experience.mode)) return;
    stopTriggers(command !== 'destroyFile' && command !== 'destroyAll');
    updatePointerContext();
    switch (command) {
      case 'mainGroupPrev': cycle(false, true, -1); break; case 'mainGroupNext': cycle(false, true, 1); break;
      case 'mainCodePrev': cycle(false, false, -1); break; case 'mainCodeNext': cycle(false, false, 1); break;
      case 'secondaryGroupPrev': cycle(true, true, -1); break; case 'secondaryGroupNext': cycle(true, true, 1); break;
      case 'secondaryCodePrev': cycle(true, false, -1); break; case 'secondaryCodeNext': cycle(true, false, 1); break;
      case 'mainToggle': mainDrawn = !mainDrawn; break; case 'secondaryToggle': secondaryDrawn = !secondaryDrawn; break;
      case 'comment': void startComment(target); break;
      case 'addVcode': quickCodePosition = { ...pointer }; break;
      case 'completeFile': void completeFile(hoveredFile || target?.path || selected); break;
      case 'destroyFile': {
        const path = hoveredFile || target?.path;
        const file = path ? viewFor(path) : undefined;
        if (file) toggleFileDestruction(file);
        break;
      }
      case 'destroyAll':
        if (!stale && supportsDestruction() && (destruction.global || canEnterDestruction())) {
          closeLineSelection();
          if (destruction.toggleAll()) emitGameEvent({ type: 'destruction-all-start' });
        }
        break;
      case 'toggleFile': if (hoveredFile) toggleFiles.get(hoveredFile)?.(); break;
      case 'reload': reloadAt = performance.now(); sound('reload'); break;
      case 'undo': void act({ type: 'undo' }).then(ok => { if (ok) toast('Undone', { id: 'history', duration: config?.display.toastMs }); }); break;
      case 'redo': void act({ type: 'redo' }).then(ok => { if (ok) toast('Redone', { id: 'history', duration: config?.display.toastMs }); }); break;
      case 'nextFile': moveFile(1); break; case 'prevFile': moveFile(-1); break;
      case 'nextUnreviewed': moveToUnreviewed(); break;
      case 'toggleScroll': autoScroll = !autoScroll; break; case 'findings': findingsOpen = !findingsOpen; break;
    }
  }

  function keydown(event: KeyboardEvent) {
    if (introductionControl) {
      if (event.key === 'Escape') introduction?.cancel();
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (event.key === 'Tab') combat.keyboardNavigation = true;
    shiftHeld = event.shiftKey;
    if (lineSelection && event.key === 'Escape') { closeLineSelection(); event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (selectionPointer !== undefined) return;
    if (!config || blocked || isUiKeyboardEvent(event, combat.keyboardNavigation)) return;
    if (event.key === '?') { helpOpen = true; event.preventDefault(); event.stopImmediatePropagation(); return; }
    const command = bindings.find(([, value]) => value === binding(event))?.[0];
    if (command) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (command === 'mainFire' || command === 'secondaryFire' || command === 'erase') { if (!event.repeat) startTrigger(command, event.code, targetAtPointer()); }
      else if (!event.repeat || command.includes('Prev') || command.includes('Next')) perform(command);
    }
  }

  function suppressBinding(event: KeyboardEvent) {
    if (!config || blocked || isUiKeyboardEvent(event, combat.keyboardNavigation)) return;
    if (bindings.some(([, key]) => key === binding(event))) { event.preventDefault(); event.stopImmediatePropagation(); }
  }

  async function choose(selection: SelectionInput, reset = false) {
    if (snapshot?.dirty || reset || operationPending) {
      selectionReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      pendingSelection = { selection, reset };
      return;
    }
    await switchTo(selection);
  }
  function restoreSelectionFocus(event?: Event) {
    const target = selectionReturnFocus?.isConnected
      ? selectionReturnFocus
      : document.querySelector<HTMLElement>('.review-selector [data-slot="button"]');
    if (target) { event?.preventDefault(); target.focus({ preventScroll: true }); }
    selectionReturnFocus = null;
  }
  async function switchTo(selection: SelectionInput, decision?: 'save' | 'discard', reset = false) {
    switching = true;
    try { receive(await api<Snapshot>('select?manifest=1', { selection, decision, reset })); pendingSelection = undefined; selectFile(reviewFiles[0]?.path || ''); toast.success(reset ? 'Fresh review loaded' : 'Review loaded'); if (decision) { await tick(); restoreSelectionFocus(); } }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { switching = false; }
  }

  async function updateReviewToHead() {
    if (!snapshot || switching || operationPending || stale) return;
    switching = true;
    stopTriggers(false); cancelAdvance();
    try {
      receive(await api<Snapshot>('update-head?manifest=1', { reviewId: snapshot.review.id }));
      selectFile(reviewFiles[0]?.path || '');
      toast.success('Review reconciled', { description: 'Unresolved findings and comments carried forward. Previous review archived.' });
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { switching = false; }
  }

  function cancelCelebration(path: string) {
    const timers = fileTargetTimers.get(path);
    clearTimeout(timers?.fade);
    clearTimeout(timers?.done);
    fileTargetTimers.delete(path);
    delete fileCelebrations[path];
  }

  function exitCompletedFile(node: HTMLElement, file: DiffFile) {
    const celebration = fileCelebrations[file.path];
    if (!celebration?.dismissing || celebration.reviewId !== snapshot?.review.id || celebration.revision !== file.revision || !scrollArea) return { duration: 0 };
    const bounds = node.getBoundingClientRect(), viewport = scrollArea.getBoundingClientRect();
    // A file already scrolled past can disappear without animating its height.
    const visible = bounds.bottom > viewport.top + reviewCeiling && bounds.top < viewport.bottom;
    return leaveCompletedFile(node, { reducedMotion: !!config?.display.reducedMotion || prefersReducedMotion.current || !visible });
  }

  async function completeFile(path: string) {
    const file = snapshot?.files.find(file => file.path === path);
    if (!file || !snapshot || !config || stale || completingFiles.has(path)) return;
    const view = viewFor(path);
    if (view?.comparison?.kind === 'history') { toast('Return to the current review round to complete this file.'); return; }
    if (snapshot.review.reviewed[path] === file.revision || fileCelebrations[path]) return;
    const destroying = !!destruction.target(view || file);
    if (destroying && !canEnterDestruction()) return;
    const completion: Action = destroying
      ? { type: 'destroy-file', path, revision: view?.revision || file.revision, comparison: view?.comparison, mark: catalog?.destructionMark || '' }
      : { type: 'review-file', path, revision: view?.revision || file.revision, comparison: view?.comparison, reviewed: true };
    if (config.gameplay.sound && config.gameplay.volume) reviewAudio?.unlock();
    completingFiles.add(path);
    try {
      const reducedMotion = config.display.reducedMotion || prefersReducedMotion.current;
      const celebration: FileCelebration = {
        reviewId: snapshot.review.id, revision: file.revision, confirmed: false,
        startedAt: performance.now(), spinMs: reducedMotion ? 0 : config.targets.spinMs,
        pauseMs: reducedMotion ? 0 : config.targets.settlePauseMs,
        phase: 'spinning',
        fadeMs: reducedMotion ? 0 : config.targets.fadeMs
      };
      cancelCelebration(path);
      fileCelebrations[path] = celebration;
      const timers: FileTargetTimers = {};
      fileTargetTimers.set(path, timers);
      let feedbackDone = false, navigationDone = false;
      const finish = () => {
        const current = fileCelebrations[path];
        if (current?.startedAt !== celebration.startedAt || !current.confirmed || !feedbackDone || !navigationDone) return;
        if (!filters.showCompleted && config?.display.fileView === 'all' && fileSections.has(path)) current.dismissing = true;
        else cancelCelebration(path);
      };

      timers.fade = setTimeout(() => {
        if (fileCelebrations[path]?.startedAt === celebration.startedAt) fileCelebrations[path].phase = 'fading';
      }, celebration.spinMs + celebration.pauseMs);
      const feedbackMs = reducedMotion ? 0 : filters.showCompleted
        ? celebration.spinMs + celebration.pauseMs + celebration.fadeMs
        : Math.min(450, celebration.spinMs);
      timers.done = setTimeout(() => { feedbackDone = true; finish(); }, feedbackMs);

      // Saving, navigation, and the target animation start independently.
      const saving = act(completion);
      const pendingAdvance = fileAdvance?.completion ? fileAdvance : undefined;
      const stickyFile = pendingAdvance?.path ?? (config.display.fileView === 'all' ? fileAtScrollPosition(reviewFiles, path => fileSections.get(path)?.getBoundingClientRect().bottom, reviewCeiling) : path);
      // The guided handoff owns navigation until the lethal hit and completion
      // feedback have painted, including in the default single-file view.
      const next = !introductionControl && path === stickyFile && !autoScroll && !blocked && !document.hidden && config.gameplay.autoAdvance ? nextUnreviewedPath(path) : undefined;
      const navigating = next ? selectFile(next, true, true) : pendingAdvance?.path === path ? pendingAdvance.done : undefined;
      if (navigating) void navigating.then(() => { navigationDone = true; finish(); });
      else navigationDone = true;
      const navigation = navigating ? navigationRevision : undefined;
      const saved = await saving;
      if (fileCelebrations[path]?.startedAt !== celebration.startedAt) return;
      if (!saved || snapshot.review.reviewed[path] !== file.revision) {
        cancelCelebration(path);
        if (navigation === navigationRevision) cancelAdvance();
        return;
      }
      fileCelebrations[path].confirmed = true;
      finish();
    } finally {
      completingFiles.delete(path);
    }
  }
  async function reopenFile(path: string) {
    const file = snapshot?.files.find(file => file.path === path);
    if (!file || !snapshot || stale || completingFiles.has(path) || snapshot.review.reviewed[path] !== file.revision) return;
    completingFiles.add(path);
    try {
      if (await act({ type: 'review-file', path, revision: file.revision, reviewed: false })) cancelCelebration(path);
    } finally { completingFiles.delete(path); }
  }
  const dispatchInstructions = $derived(`Read the review job at ${dispatchPath}. Follow the review-agent skill in the meat-proxy package, fix the open findings, and report resolutions through the connection file or inbox referenced in the job.`);
  async function copyDispatchInstructions() {
    try {
      await navigator.clipboard.writeText(dispatchInstructions);
      toast.success('Agent instructions copied');
      return true;
    } catch {
      toast.error('Clipboard unavailable. Copy the instructions from the dispatch dialog.');
      return false;
    }
  }
  async function rememberDispatchPreference(autoCopyInstructions: boolean) {
    if (!config || dispatchPreferenceSaving) return;
    dispatchPreferenceSaving = true;
    try { await saveConfig({ ...$state.snapshot(config), dispatch: { ...config.dispatch, autoCopyInstructions } }); }
    catch (error) { toast.error(`Could not save dispatch preference: ${String(error)}`); }
    finally { dispatchPreferenceSaving = false; }
  }
  async function dispatch() {
    if (!snapshot || dispatching || operationPending || stale) return;
    if (!dispatchSummary.findings && (!reviewComplete || snapshot.review.finishedAt)) return;
    dispatching = true;
    try {
      if (!dispatchSummary.findings) {
        if (await act({ type: 'finish' })) await act({ type: 'save' });
        return;
      }
      const result = await api<{ path: string; snapshot: Snapshot; id: string; summary: DispatchSummary }>('dispatch', { reviewId: snapshot.review.id });
      dispatchPath = result.path;
      dispatchedSummary = result.summary;
      receive(result.snapshot);
      sound('reload');
      if (isDemo) {
        demoDispatchId = result.id; demoDispatchCount = result.summary.findings;
        demoDispatchPaths = [...new Set(result.snapshot.review.findings.filter(finding => finding.status === 'open' && result.snapshot.review.dispatchedFindingIds?.includes(finding.id)).map(finding => finding.path))];
        demoAgentResult = undefined; demoAgentError = ''; demoAgentReviewed = ''; demoTranscriptReady = false; dispatchOpen = true;
      }
      else dispatchOpen = !config?.dispatch.autoCopyInstructions || !await copyDispatchInstructions();
    }
    catch (e) { toast.error(String(e)); } finally { dispatching = false; }
  }
  async function runDemoAgent() {
    if (!snapshot || demoAgentRunning || demoAgentResult || !demoDispatchId) return;
    demoAgentRunning = true; demoAgentError = '';
    try {
      const result = await api<{ snapshot: Snapshot; resolved: number; changed: number }>('demo-agent', { reviewId: snapshot.review.id, dispatchId: demoDispatchId, commit: demoCommit });
      receive(result.snapshot);
      data = await api<Bootstrap>('bootstrap?manifest=1');
      demoAgentResult = { resolved: result.resolved, changed: result.changed };
    } catch (error) { demoAgentError = error instanceof Error ? error.message : String(error); }
    finally { demoAgentRunning = false; }
  }
  function reviewDemoChanges() {
    if (!demoAgentResult) return;
    demoAgentReviewed = demoDispatchId; dispatchOpen = false;
    findingsFilter = 'resolved'; findingsOpen = !tutorialActive;
  }
  function closeDispatch() { if (isDemo && demoAgentResult) reviewDemoChanges(); else dispatchOpen = false; }
  function jump(finding: Finding) {
    if (snapshot?.files.some(f => f.path === finding.path)) {
      filters = { ...filters, showCompleted: true, showDeleted: true, presetIds: presetMatches.paths?.has(finding.path) === false ? [] : filters.presetIds, excludedExtensions: filters.excludedExtensions.filter(extension => extension !== fileExtension(finding.path)) };
      void selectFile(finding.path);
      if (finding.version) findingHistory[finding.path] = { id: finding.id, at: performance.now() };
      else if (!hasLocation(snapshot.files, finding)) toast('This finding predates the retained history. Its original location is preserved in the log.');
    } else toast('This file is outside the current review. The finding is retained in the log.');
  }
  function revealTutorialFile(path: string) {
    autoScroll = false;
    fileSearch.query = '';
    filters = { ...filters, showDeleted: true, presetIds: [], excludedExtensions: filters.excludedExtensions.filter(extension => extension !== fileExtension(path)) };
    chooseFileView(path, latestView);
    void selectFile(path);
  }
  async function updateDisplay(display: Partial<Config['display']>) {
    if (!config) return;
    const path = selected;
    try {
      config = await api<Config>('config', { ...$state.snapshot(config), display: { ...config.display, ...display } });
      if (display.fileView) await selectFile(path);
    } catch (e) { toast.error(String(e)); }
  }

  async function updateScrollSpeed(scrollPxPerSecond: number) {
    if (!config) return;
    try {
      config = await api<Config>('config', { ...$state.snapshot(config), gameplay: { ...config.gameplay, scrollPxPerSecond } });
    } catch (error) { toast.error(String(error)); }
  }

  async function disableSplash() {
    if (!config) return;
    try { await saveConfig({ ...$state.snapshot(config), display: { ...config.display, showSplashScreen: false } }); }
    catch (error) { toast.error(String(error)); throw error; }
  }

  async function updateHudWordWrap(codeWordWrap: boolean) {
    if (!config) return;
    try { await saveConfig({ ...$state.snapshot(config), hud: { ...config.hud, codeWordWrap } }); }
    catch (error) { toast.error(String(error)); }
  }

  async function saveConfig(value: Config) {
    const viewChanged = value.display.fileView !== config?.display.fileView;
    const completedChanged = value.display.showCompletedFiles !== config?.display.showCompletedFiles;
    const sortChanged = value.display.fileSort !== config?.display.fileSort;
    const autoScrollChanged = value.gameplay.autoScroll !== config?.gameplay.autoScroll;
    const path = selected;
    config = await api<Config>('config', value);
    if (completedChanged) filters = { ...filters, showCompleted: config.display.showCompletedFiles };
    if (sortChanged) fileSort = config.display.fileSort;
    if (autoScrollChanged) autoScroll = config.gameplay.autoScroll;
    if (viewChanged) await selectFile(path);
  }
</script>

<svelte:head><title>{data?.name || 'meat-proxy'}</title><meta name="description" content="Your code review. Your arsenal. A local-first review arena." /></svelte:head>

<div class={['relative isolate min-h-dvh font-sans text-[length:var(--ui-font-size)] leading-[1.45]', !startup && 'bg-background']} style:--ui-font-size={`${config?.display.uiFontSize || defaults.display.uiFontSize}px`} style:--ui-label-size={`${config?.display.uiLabelSize || defaults.display.uiLabelSize}px`}>
{#if showSplash && !startup && config && (!splashAudioFinished || startupVisible || startupLeaving || (landscapeActive && defaultSplash2Config.scene.enabled))}
  <Splash2Playback config={defaultSplash2Config} playing={(splashPrepared || !startupVisible) && !loadingError && !splashFailed} bind:time={openingTime} bind:sceneTime
    sound={config.gameplay.sound} volume={config.gameplay.volume} reducedMotion={reducedStartupMotion}
    handoff={!startupVisible} gameReady={!starting} canSkip={arenaPrepared} ondisable={disableSplash} onprepared={ready => splashAudioReady = ready} onfinished={() => splashAudioFinished = true} />
{/if}
{#if !startup?.onbackgroundchange}
  <SceneBackdrop intro={landscapeVisible} departing={!startupVisible} prepared={splashPrepared && !loadingError}
    time={sceneTime} introReducedMotion={reducedStartupMotion} reducedMotion={!!config?.display.reducedMotion || prefersReducedMotion.current} {background}
    onintroend={() => landscapeActive = false} onstatus={status => landscapeReady = status !== 'loading'} />
{/if}
{#if startupVisible && !startup}
  {#if loadingError}
    <main class="boot-screen"><img src={assetUrl('/favicon.png')} alt="" width="68" height="68" /><h1>Unable to load review</h1><p>{loadingError}</p><Button size="lg" onclick={load}>Try again</Button><p class="text-xs">{#if isDemo}Reload to reconnect to the browser repository.{:else}Run from a Git repository, or choose one with <code>meat-proxy --dir &lt;path&gt;</code>.{/if}</p></main>
  {:else}
    <main class="startup-screen fixed inset-0 z-200 h-dvh w-full overflow-hidden will-change-[opacity,transform]" aria-label="Starting Meat Proxy" aria-busy="true"
      out:leaveSplash|global={{ reducedMotion: reducedStartupMotion }}
      onoutroend={finishStartup}>
      {#if splashStarted && showSplash && config}
        <SplashScreen config={defaultSplash2Config} landscape={false} showArtwork={splashPrepared && !splashFailed} paused={!splashPrepared}
          time={openingTime} externalClock
          reducedMotion={config.display.reducedMotion || undefined}
          onready={() => splashImagesReady = true}
          oncomplete={() => splashComplete = true}
          onerror={() => { splashFailed = true; splashComplete = true; }} />
      {/if}
      {#if !data || !config || !catalog || !snapshot || (showSplash && !splashPrepared)}<div class="absolute inset-0 grid place-content-center bg-background font-sans text-sm text-muted-foreground" role="status">Loading audio…</div>{/if}
    </main>
  {/if}
{/if}
{#if data && config && catalog && snapshot}
  <div class={['review-stage relative z-1 transition-opacity ease-[cubic-bezier(.4,0,.2,1)]', startupVisible ? 'opacity-0' : 'opacity-100', reducedStartupMotion ? 'delay-0 duration-100' : 'duration-600']} class:revealed={!startupVisible} class:reduced-motion={reducedStartupMotion} inert={splashBlocking} aria-hidden={splashBlocking}>
  <UiConfig {config} />
  <div class="arena relative isolate block h-dvh min-h-[500px] min-w-[600px] overflow-hidden" bind:this={arena} class:landscape-active={landscapeVisible} class:sidebar-left={config.display.sidebarLeft} class:armed data-experience={config.experience.mode} class:reduced-motion={config.display.reducedMotion} data-combat-cursor={combatCursor}
    style:--hud-clearance={`${gameEnabled ? hudClearance : 0}px`}
    style:--file-header-height={`${config.display.fileHeaderHeight}px`} style:--file-header-padding={`${config.display.fileHeaderPadding}px`} style:--file-header-padding-left={`${config.display.fileHeaderPaddingLeft}px`} style:--file-copy-size={`${config.display.fileCopyButtonSize}px`}
    style:--chrome-inset={`${config.display.chromeInsetPx}px`} style:--chrome-gap={`${config.display.chromeGapPx}px`}
    style:--file-target-size={`${config.display.fileTargetSize}px`}
    style:--code-preferred-width={`${config.display.codeWidthPx + (config.display.wideMode ? config.display.wideExtraPx : 0)}px`}
    style:--code-min-width={`${config.display.codeMinWidthPx}px`} style:--rail-preferred-width={`${config.display.sidePanelWidthPx}px`} style:--rail-min-width={`${Math.min(config.display.sidePanelMinWidthPx, config.display.sidePanelWidthPx)}px`}
    style:--findings-gutter={`${Math.max(config.display.findingsGutterPx, config.display.badgeSize * config.display.rangeBadgeScale + config.display.fileBadgePaddingPx)}px`}
    style:--target-overhang={`${Math.max(0, config.display.fileTargetSize / 2 + config.display.fileTargetOffsetX)}px`}
    style:--toolbar-height={`${toolbarHeight}px`} style:--logo-center={`${logoCenter}px`} style:--review-ceiling={`${reviewCeiling}px`}>
    <div class="arena-background pointer-events-none absolute inset-0 -z-1" class:hidden={landscapeVisible || background.mode === 'scene'} aria-hidden="true"></div>
    <div class="arena-scene-focus pointer-events-none absolute inset-0 -z-1" style:opacity={background.mode === 'scene' && !landscapeVisible ? background.sceneFocus : 0} aria-hidden="true"></div>
    {#if gameEnabled}<ImpactLayer {config} bind:this={impacts} /><DestructionLayer bind:this={destructionEffects} {config} paused={blocked || stale} />{/if}
    <!-- Let the tree sit below weapons while navigation controls stay above them. -->
    <aside class="review-rail pointer-events-none absolute inset-y-(--chrome-inset) left-(--rail-left) flex w-(--rail-width) flex-col gap-[calc(var(--chrome-gap)+4px)]" style:--logo-space={`${logoSpace.current * (toolbarHeight + config.display.chromeGapPx)}px`} style:bottom={`max(var(--chrome-inset), ${gameEnabled ? hudRailClearance : 0}px)`} aria-label="Review navigation">
      <div class="pointer-events-none absolute top-(--logo-center) w-full z-36 flex -translate-y-1/2 items-center justify-center">
        {#if isDemo}<DemoInstall ready={tutorialActive || !starting && !introducing && !stale && !switching} destroyed={logoDestroyed} reducedMotion={reducedStartupMotion} pulseMs={config.display.dispatchPulseMs} />
        {:else}<ArenaLogo destroyed={logoDestroyed} reducedMotion={!gameEnabled || config.display.reducedMotion} />{/if}
      </div>
      <div class="review-overview pointer-events-auto z-35 mt-(--logo-space) flex min-w-0 flex-none flex-col gap-[calc(var(--chrome-gap)+4px)]">
        <div class="flex min-w-0 flex-col gap-1.5">
          <ReviewSelector repo={data.repo} selection={snapshot.review.selection} baselineOid={snapshot.review.baselineOid} additions={delta.additions} deletions={delta.deletions} covered={delta.covered} reducedMotion={config.display.reducedMotion} updating={switching} updateDisabled={operationPending > 0 || stale} onupdate={updateReviewToHead} onselect={choose} onrefresh={path => api<Repository>(`repo${path ? `?worktree=${encodeURIComponent(path)}` : ''}`)} />
          {#key snapshot.review.id}
            <ReviewProgress reviewed={reviewedCount} total={snapshot.files.length} findings={findingsProgress} reducedMotion={config.display.reducedMotion} />
          {/key}
        </div>
        <div>
          <DispatchButton summary={dispatchSummary} sent={findingsProgress.total - findingsProgress.resolved - findingsProgress.undispatched} complete={reviewComplete} finished={!!snapshot.review.finishedAt} pending={dispatching} disabled={dispatching || operationPending > 0 || stale} {config} onclick={dispatch} />
          {#if isDemo}<p class="mt-1.5 px-1 text-[10px] text-muted-foreground">Demo · reload to start over</p>{/if}
        </div>
      </div>
      <FileExplorerPane sidebarLeft={config.display.sidebarLeft} visible={config.display.explorerVisible}>
        {#snippet children(resizeHandle)}
          {#if config && snapshot}
            <div class="min-h-0 flex-1 overflow-visible overscroll-contain"><FileExplorer search={fileSearch} findings={activeFindings} showFindings={config.display.showFileFindings} showComments={config.display.showFileComments} showGitStatus={config.display.showFileGitStatus} showReviewed={config.display.showFileReviewed} ondisplaychange={updateDisplay} density={config.display.fileTreeDensity} showIcons={config.display.showFileIcons} files={reviewFiles} allFiles={snapshot.files} {filters} presets={config.fileFilters.presets} presetError={presetMatches.error} onpresetschange={saveFilePresets} onfilter={filterFiles} {selected} reviewed={displayedReviewed} visible={config.display.explorerVisible} onselect={selectFile} {resizeHandle} /></div>
          {/if}
        {/snippet}
      </FileExplorerPane>
    </aside>
    <main class="absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div class="relative flex h-full min-h-0 flex-1">
        <div class="@container/toolbar absolute left-(--code-left) w-(--code-width) top-(--chrome-inset) z-24 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 font-sans text-sm text-foreground" role="toolbar" aria-label="Review view" bind:this={pageToolbar} style:--ui-font-size={`${config.display.uiFontSize - 1}px`}>
          <div class="flex min-h-11 min-w-0 max-w-full flex-wrap items-center justify-self-start gap-x-5 gap-y-2 rounded-lg border border-border bg-card px-2 py-1.5 @max-[1150px]/toolbar:gap-x-2">
            <FileNavigation total={reviewFiles.length} index={reviewFiles.findIndex(file => file.path === selected)} sort={fileSort} priorities={config.display.filePriorities}
              onpriorities={value => { cancelAdvance(); return updateDisplay({ filePriorities: value }); }}
              previousKey={shortcut('prevFile')} nextKey={shortcut('nextFile')} unreviewedKey={shortcut('nextUnreviewed')}
              hasUnreviewed={!!nextUnreviewedPath(selected)} onprevious={() => moveFile(-1)} onnext={() => moveFile(1)} onunreviewed={() => moveToUnreviewed()}
              onsort={value => { cancelAdvance(); fileSort = value; }} />
            {#if hasLiveFiles}<ReviewComparison value={reviewView} overrides={comparisonOverrides} helpDelay={config.display.tooltipDelayMs} onchange={chooseAllViews} />{/if}
            <div class="flex min-w-0 flex-wrap items-center gap-1" role="group" aria-label="Reading controls">
              <ReviewViewOptions display={config.display} onchange={updateDisplay} />
              <AutoScroll bind:active={autoScroll} speed={config.gameplay.scrollPxPerSecond} onspeed={updateScrollSpeed} />
            </div>
          </div>
          <div class="flex min-h-11 items-center justify-end gap-1 self-start rounded-lg bg-card px-1.5 py-1.5 @max-[950px]/toolbar:hidden" data-cursor="native" role="group" aria-label="Review tools">
            <Hint text="Open findings">
              {#snippet children({ props })}<Toggle.Root {...props} bind:ref={findingsTrigger} aria-label="Toggle findings" bind:pressed={findingsOpen} class="gap-2 data-[state=on]:text-primary"><ListChecks /><span class="@max-[1150px]/toolbar:hidden">Findings</span><span class="rounded bg-muted px-1.5 text-xs tabular-nums">{openFindings}</span></Toggle.Root>{/snippet}
            </Hint>
            <Hint text="V-codes & canned responses">
              {#snippet children({ props })}<Button {...mergeProps(props, { onclick: () => commandOpen = true })} variant="ghost" aria-label="Open rules"><Layers3 />Rules</Button>{/snippet}
            </Hint>
            <span class="mx-1 h-4 w-px bg-border" aria-hidden="true"></span>
            <Hint text="Field manual">
              {#snippet children({ props })}<Button {...mergeProps(props, { onclick: () => helpOpen = true })} variant="ghost" size="icon" aria-label="Open field manual"><BookOpen /></Button>{/snippet}
            </Hint>
            <Hint text="Settings">
              {#snippet children({ props })}<Button {...mergeProps(props, { onclick: () => { if (settingsOpen) void settingsPanel?.close(); else settingsOpen = true; } })} variant="ghost" size="icon" aria-label="Open settings" selected={settingsOpen} aria-pressed={settingsOpen}><SettingsIcon /></Button>{/snippet}
            </Hint>
            {#if dev && gameEnabled}<DevMenu open={devOpen} onclick={() => devOpen = !devOpen} />{/if}
          </div>
          <ReviewToolsMenu compact={toolbarWidth < 950} fallbackTrigger={findingsTrigger} {openFindings} {findingsOpen} {settingsOpen} {devOpen}
            onfindings={() => findingsOpen = !findingsOpen} onrules={() => commandOpen = true} onhelp={() => helpOpen = true}
            onsettings={() => { if (settingsOpen) void settingsPanel?.close(); else settingsOpen = true; }}
            ondev={dev && gameEnabled ? () => devOpen = !devOpen : undefined} />
        </div>
        <!-- The gutters allow the sticky icons' overhang above the code ceiling.
             The final strip leaves the native scrollbar fully accessible. -->
        <div class="diff-scroll min-h-0 min-w-0 flex-1 overflow-auto absolute inset-0 overflow-x-hidden bg-transparent [scrollbar-gutter:stable] [scroll-padding-top:var(--review-ceiling)] [--code-right:calc(var(--code-left)+var(--code-width))] [clip-path:polygon(0_var(--gutter-ceiling),var(--code-left)_var(--gutter-ceiling),var(--code-left)_var(--review-ceiling),var(--code-right)_var(--review-ceiling),var(--code-right)_var(--gutter-ceiling),var(--scroll-content-width)_var(--gutter-ceiling),var(--scroll-content-width)_0,100%_0,100%_100%,0_100%)]"
          style:--gutter-ceiling={`${gutterCeiling}px`} style:--scroll-content-width={`${scrollContentWidth}px`}
          bind:this={scrollArea} bind:clientWidth={scrollContentWidth} onwheel={() => { autoScroll = false; searchScrollRestore = undefined; }} onscroll={pageScrolled}>
          <div class="ml-(--code-left) w-(--code-width) pt-(--review-ceiling) pb-(--review-tail) [--review-margin:var(--badge-room)] [&>.empty-state]:min-h-[calc(100dvh-430px)]" class:all-files={config.display.fileView === 'all'}>
          {#if stale}<div class="flex items-center gap-4 border-b border-primary/20 bg-primary/10 p-6 text-sm text-primary [&_p]:mt-1.5 [&_p]:text-xs [&_p]:text-muted-foreground"><Radio size={18} /><div><strong>Reconnecting</strong><p>Waiting for the current diff.</p></div><Button variant="outline" size="lg" onclick={load}>Reconnect</Button></div>
          {:else if visibleFiles.length && scrollArea && virtualizer}
            {#key virtualizer}
              {#each visibleFiles as file (`${snapshot.review.id}:${snapshot.review.createdAt}:${file.path}`)}
                <FileSlot ondestruction={toggleFileDestruction} onselection={openViolationWheel} lineSelection={lineSelection?.aim.path === file.path ? lineSelection : undefined} {filePatches} {file} {diffCache} exit={node => exitCompletedFile(node, file)} onexit={() => { if (fileCelebrations[file.path]?.dismissing) cancelCelebration(file.path); }} reviewId={snapshot.review.id} onview={updateFileView} viewSelection={file.live ? fileViewSelections[file.path] || defaultView : latestView} onviewselect={chooseFileView} requestedFinding={findingHistory[file.path]} findings={findingsByFile.get(file.path) || noFindings} {catalog} config={file.path === tutorialFocus ? tutorialFileConfig! : config} {virtualizer} scrollRoot={scrollArea} stickyCeiling={reviewCeiling} {armed} reviewed={displayedReviewed[file.path] === file.revision} celebration={fileCelebrations[file.path]} register={registerFile} oncomplete={completeFile} onreopen={reopenFile} onresolve={id => act({ type: 'resolve', id })} ondelete={id => act({ type: 'delete', id })} onreply={(id, comment) => act({ type: 'reply', id, comment })} ondeletereply={(id, replyId) => act({ type: 'delete-reply', id, replyId })} onreopencomment={id => act({ type: 'reopen', id })} {inspectedFindingId} oninspect={id => inspectedFindingId = id} />
              {/each}
            {/key}
          {:else if snapshot.files.length}
            <div class="empty-state flex min-h-[330px] flex-col items-center justify-center gap-4 px-6 py-15 text-center text-muted-foreground [&_h2]:text-3xl [&_h2]:text-foreground [&_h3]:text-2xl [&_h3]:text-foreground [&_p]:max-w-[490px] [&_p]:text-sm"><Crosshair size={58} strokeWidth={1} /><h2>{presetMatches.pending ? 'Applying filter presets…' : presetMatches.error ? 'Could not apply filter presets' : 'No files match the filters'}</h2>{#if presetMatches.error}<p role="alert">{presetMatches.error}</p>{/if}{#if !presetMatches.pending}<Button variant="outline" onclick={() => { fileSearch.query = ''; filterFiles({ excludedExtensions: [], showCompleted: true, showDeleted: true }); }}>Show all files</Button>{/if}</div>
          {:else}
            <div class="empty-state flex min-h-[330px] flex-col items-center justify-center gap-4 px-6 py-15 text-center text-muted-foreground [&_h2]:text-3xl [&_h2]:text-foreground [&_h3]:text-2xl [&_h3]:text-foreground [&_p]:max-w-[490px] [&_p]:text-sm"><Crosshair size={58} strokeWidth={1} /><h2>No changes</h2><p>Choose a different source or target to review.</p><Button variant="outline" size="lg" onclick={() => helpOpen = true}><BookOpen size={14} />Read the field manual</Button></div>
          {/if}
          {#if snapshot.warning}<div class="flex items-center gap-4 border-b border-primary/20 bg-primary/10 p-6 text-sm text-primary [&_p]:mt-1.5 [&_p]:text-xs [&_p]:text-muted-foreground"><AlertTriangle size={16} />{snapshot.warning}</div>{/if}
          </div>
        </div>
        <Findings bind:filter={findingsFilter} open={findingsOpen} reviewId={snapshot.review.id} findings={activeFindings} files={snapshot.files} {catalog} {config} onaction={act} onjump={jump} onclose={() => findingsOpen = false} />
      </div>

      {#if gameEnabled}
      {#key weaponRendererKey}<WeaponOverlay bind:this={weaponOverlay} {config} anchor={combatLayer} trackingPaused={selectionWheel || combat.weaponTrackingPaused} paused={hudStartupPhase === 'weapons' ? false : blocked || stale} {mainModel} {secondaryModel} mainDrawn={visibleMainDrawn} secondaryDrawn={visibleSecondaryDrawn} mainHolster={mainHolster.current} secondaryHolster={secondaryHolster.current} {mainShot} {secondaryShot} {mainShotCharge} {secondaryShotCharge} {mainFiringSince} {secondaryFiringSince} reload={reloadAt} {pointer} onready={(slot, model) => weaponModelsReady[slot] = model} />{/key}

      <div class="combat-layer" bind:this={combatLayer}>
        {#if primaryRule && primaryGroup && secondaryRule && otherGroup}
          <GameHud {config} {primaryGroup} secondaryGroup={otherGroup} {primaryRule} {secondaryRule}
            mainDrawn={visibleMainDrawn} secondaryDrawn={visibleSecondaryDrawn} oncycle={cycleFromHud} onwordwrapchange={updateHudWordWrap}
            startup={hudStartupPhase} entranceMs={introducing ? startup?.introduction?.entranceMs : 0} onstartupcomplete={phase => hudStartup.complete(phase)}
            bind:clearance={hudClearance} bind:railClearance={hudRailClearance} bind:navigating={hudNavigating}>
            {#snippet portrait()}
              {#if config}
                <HudAvatar cover={hudCover} oncovered={transmissionCovered} onprepared={ready => portraitReady = ready} request={avatarRequest} transitions={hudPresentation.transitions} effects={hudPresentation.effects} effectOverrides={hudPresentation.effectOverrides} effectsEnabled={hudPresentation.effectsEnabled && avatar.effectsEnabled} tilt={hudPresentation.tilt} motion={hudPresentation.motion} framing={hudPresentation.framing} quality={hudPresentation.quality} reducedMotion={config.display.reducedMotion || prefersReducedMotion.current} paused={avatarLab.paused} puff={avatarPuff} flash={avatarFlash} reset={avatarReset} onplayback={dev ? state => avatarPlayback = state : undefined} oncomplete={id => gameEvents?.hudFinished(id)} startup={portraitStartup} onstartupcomplete={() => hudStartup.complete('shutter')} />
                {#if dev && avatarLab.clickCycle}<DevCycle onclick={cycleAvatar} />{/if}
              {/if}
            {/snippet}
          </GameHud>
        {/if}
      </div>
      {/if}
    </main>
  </div>


  {#if introductionControl}<button class="fixed bottom-5 right-5 z-250 rounded border border-border bg-background/90 px-3 py-2 text-xs text-muted-foreground" data-intro-cancel onclick={() => introduction?.cancel()}>Skip demonstration · Esc</button>{/if}
  {#if settingsOpen}<Settings bind:this={settingsPanel} {config} onsave={saveConfig} oncolorevent={colorUnlockEvent} oncinematic={active => colorUnlockActive = active} onimport={async value => { receiveCatalog(await api<Catalog>('catalog', value)); mainIndices = {}; secondaryIndices = {}; mainGroup = 0; secondaryGroup = Math.max(0, Math.min(1, activeGroups.length - 1)); }} onclose={() => settingsOpen = false} />{/if}
  {#if wheelPosition && lineSelection}<ViolationWheel groups={activeGroups} position={wheelPosition} selection={lineSelection} selectionMode={shiftHeld ? 'multiple' : 'single'} showIcons={config.display.weaponDisplay === 'image'} onselect={markSelectedLines} onclose={closeLineSelection} />{/if}
  {#if quickCodePosition}<QuickVcode {catalog} {config} position={quickCodePosition} onaction={editCatalog} onclose={() => quickCodePosition = undefined} />{/if}
  {#snippet tutorialInDialog(host: 'agent' | 'armory')}
    {#if config && tutorialDialog?.host === host}<TutorialGuide {...tutorialDialog.guide} presentation={avatar} reducedMotion={config.display.reducedMotion} embedded />{/if}
  {/snippet}
  {#if commandOpen}<Command {catalog} {config} onaction={editCatalog} onclose={() => commandOpen = false}>
    {#snippet guidance()}{@render tutorialInDialog('armory')}{/snippet}
  </Command>{/if}
  {#if gameEnabled}<Transmission active={activeTransmission} example={activeTransmission?.id === exampleTransmission.id} {config} presentation={avatar} diff={combatLayer} navigating={hudNavigating} clearance={hudRailClearance} prewarm={!starting} onprepared={ready => transmissionPortraitReady = ready} onoutrocomplete={transmissionOutroComplete} />{/if}
  <FirstSteps bind:this={tutorial} bind:active={tutorialActive} bind:focus={tutorialFocus} bind:dialogGuide={tutorialDialog} {snapshot} {config} presentation={avatar} demo={isDemo} code={primaryRule?.id}
    nukeAvailable={gameEnabled && supportsDestruction()} nukeMark={destructionMark?.kind === 'code' ? destructionMark.rule.id : destructionMark?.response.id}
    onconfigureNuke={() => commandOpen = true}
    armoryOpen={commandOpen} outboxOpen={dispatchOpen} agentPhase={demoAgentPhase} agentReviewed={!!demoDispatchId && demoAgentReviewed === demoDispatchId} {inspectedFindingId}
    onarmory={open => commandOpen = open} onoutbox={() => dispatchOpen = true} oncloseFinding={() => inspectedFindingId = undefined} paused={combat.paused}
    preview={startup?.preview} ready={!starting && !introducing && !stale && !switching} holding={heldCombat || !!lineSelection} pending={operationPending > 0}
    suspended={settingsOpen || findingsOpen || devOpen || !!wheelPosition || !!quickCodePosition || helpOpen || !!pendingSelection || !!commentAim} onreveal={revealTutorialFile} />
  {#if dev && gameEnabled}<DevPanel open={devOpen} bind:selectionWheel bind:transmissionExample={() => transmissionExample, setTransmissionExample} bind:presentation={avatar} bind:options={avatarLab} playback={avatarPlayback} {config} content={eventContent} ruleStatus={eventRuleStatus} events={gameEventState} dismissed={transmissionDismissed} ongameevent={cue => gameEvents?.play(cue)} onclearevents={resetGameEvents} oncontent={value => eventContent = value} onclose={() => devOpen = false} onrequest={requestHud} onreset={() => { resetGameEvents(); avatarLab.paused = false; }} onpuff={() => avatarPuff++} onflash={() => avatarFlash++} onpreview={value => config = value} />{/if}
  {#if pendingSelection}
    <AlertDialog.Root open={true} onOpenChange={open => { if (!open && !selectionBusy) { pendingSelection = undefined; void tick().then(() => restoreSelectionFocus()); } }}>
      <AlertDialog.Content variant="panel" size="lg" onEscapeKeydown={event => { if (selectionBusy) event.preventDefault(); }} onCloseAutoFocus={restoreSelectionFocus}>
        <AlertDialog.Header class="place-items-start border-b border-border bg-card/40 px-6 py-5 text-left">
          <p class="text-xs text-muted-foreground">REVIEW CHECKPOINT</p>
          <AlertDialog.Title class="text-2xl font-semibold tracking-tight">{pendingSelection.reset ? 'Restart review?' : 'Save changes?'}</AlertDialog.Title>
        </AlertDialog.Header>
        <div class="p-6 [&>p]:mb-5 [&>p]:text-sm [&>p]:text-muted-foreground">
          <AlertDialog.Description>{pendingSelection.reset ? 'Start this selection again with a fresh review. The previous review is archived.' : 'You have findings or progress since your last checkpoint. Save them before switching, or return to that checkpoint.'}</AlertDialog.Description>
          <div class="mt-4 flex items-center gap-2 flex-wrap">
            <Button disabled={selectionBusy} onclick={() => pendingSelection && void switchTo(pendingSelection.selection, 'save', pendingSelection.reset)}>{pendingSelection.reset ? 'Save & restart' : 'Save & continue'}</Button>
            <Button variant="destructive" disabled={selectionBusy} onclick={() => pendingSelection && void switchTo(pendingSelection.selection, 'discard', pendingSelection.reset)}>{pendingSelection.reset ? 'Discard & restart' : 'Discard & continue'}</Button>
            <Button variant="outline" disabled={selectionBusy} onclick={() => { pendingSelection = undefined; restoreSelectionFocus(); }}>Keep reviewing</Button>
          </div>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Root>
  {/if}
  {#if commentAim}
    <Modal title="Add comment" eyebrow={`COMMENT / ${commentAim.path}${commentAim.line ? `:${commentAim.line}` : ' · FILE'}`} onclose={() => commentAim = undefined}>
      <div class="p-6">
        <Textarea class="min-h-40 resize-y font-sans text-sm leading-relaxed" bind:ref={commentInput} bind:value={commentText} aria-label="Comment" maxlength={20000} placeholder="What needs to change?" onkeydown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submitComment(); } }} />
        <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
          <CannedResponsePicker {catalog} disabled={operationPending > 0} onselect={insertCommentResponse} />
          <Button disabled={!commentText.trim() || operationPending > 0} onclick={submitComment}><MessageSquare size={15} />Add comment</Button>
        </div>
        <p class="mt-3 text-xs text-muted-foreground">Enter to submit · Shift+Enter for a new line</p>
      </div>
    </Modal>
  {/if}
  {#if dispatchOpen}
    <Modal title="Put your agent to work" eyebrow="AGENT OUTBOX" onclose={closeDispatch}>
      {#snippet guidance()}{@render tutorialInDialog('agent')}{/snippet}
      <div class="space-y-5 p-6 text-sm">
        <p class="text-muted-foreground">Sent {dispatchedSummary.findings} open finding{dispatchedSummary.findings === 1 ? '' : 's'} from {dispatchedSummary.files} completed file{dispatchedSummary.files === 1 ? '' : 's'}, with their diffs and review context.</p>
        {#if dispatchedSummary.held}<p class="text-muted-foreground">{dispatchedSummary.held} finding{dispatchedSummary.held === 1 ? '' : 's'} in unfinished files held back. Complete those files to include them in a later dispatch.</p>{/if}
        <code class="block rounded border border-border bg-muted/30 p-3.5 leading-relaxed wrap-anywhere">{dispatchPath}</code>
        {#if isDemo}
          {#if demoAgentRunning || demoAgentResult || demoAgentError}
            <DemoAgentTerminal count={demoDispatchCount} paths={demoDispatchPaths} running={demoAgentRunning} result={demoAgentResult} error={demoAgentError}
              reducedMotion={config.display.reducedMotion} bind:transcriptReady={demoTranscriptReady} onreview={reviewDemoChanges} onretry={runDemoAgent} />
          {:else}
          <p class="text-muted-foreground">Run the simulated agent to add or refresh a demo comment near each finding and reply to your feedback. Each pass creates fresh changes to review. Pinned comparisons stay on their selected commits.</p>
          <label class="flex items-center gap-2 text-muted-foreground"><input type="checkbox" bind:checked={demoCommit} />Commit the agent's changes in this browser repository</label>
          <div class="flex flex-wrap gap-3"><Button data-tutorial="agent-run" disabled={!demoDispatchCount} onclick={runDemoAgent}>Run simulated agent</Button><Button variant="outline" onclick={() => dispatchOpen = false}>Keep reviewing</Button></div>
          {/if}
        {:else}
          <p class="text-muted-foreground">Copy these instructions and paste them into your agent. Dispatch saves an outbox job; it does not start an agent. Your agent can report resolutions back while you keep reviewing.</p>
          <Textarea readonly value={dispatchInstructions} aria-label="Agent instructions" class="min-h-32 resize-y text-sm" />
          <div class="space-y-2">
            <div class="flex items-start gap-2">
              <Checkbox id="dispatch-auto-copy" class="mt-0.5" checked={config.dispatch.autoCopyInstructions} disabled={dispatchPreferenceSaving} onCheckedChange={rememberDispatchPreference} aria-describedby="dispatch-preference-help" />
              <Label for="dispatch-auto-copy" class="leading-snug">Automatically copy instructions and skip this dialog next time</Label>
            </div>
            <p id="dispatch-preference-help" class="text-xs text-muted-foreground">{dispatchPreferenceSaving ? 'Saving preference…' : 'Remembered for future dispatches. Change this in Settings → Review exports.'}</p>
          </div>
          <div class="flex flex-wrap gap-3"><Button onclick={async () => { if (await copyDispatchInstructions()) dispatchOpen = false; }}>Copy instructions &amp; close</Button><Button variant="outline" onclick={() => dispatchOpen = false}>Keep reviewing</Button></div>
        {/if}
      </div>
    </Modal>
  {/if}
  {#if helpOpen}<Modal title="Controls" onclose={() => helpOpen = false} wide layoutKey="controls">
    <div class="flex items-center justify-between gap-5 border-b border-border px-7 py-5">
      <div><h3 class="text-lg font-semibold">First steps</h3><p class="text-sm text-muted-foreground">{tutorialFile(snapshot) ? 'One finding, from marking lines to dispatch. Replay anytime.' : 'Open an unreviewed text diff to try the guided review.'}</p></div>
      <Button variant="outline" disabled={!primaryRule || !tutorialFile(snapshot)} onclick={() => { helpOpen = false; tutorial?.restart(); }}>Start tutorial</Button>
    </div>
    <div class="flex items-center gap-6 bg-muted/20 p-7 [&_svg]:shrink-0 [&_p]:text-sm [&_p]:text-muted-foreground"><VImage index={0} size={95} /><div><p>{#if !gameEnabled}Click a line, or drag across lines, then release to choose a violation from the wheel. Click the file header for a whole-file finding. Use the existing comment and erase shortcuts. Hold Shift to apply several codes. Click the completion target or use the completion shortcut to finish a file. Click its checkmark to reopen it.{:else}Pick a rule, aim, and hold fire. Sweep across lines to mark a range. One trigger pull is one undoable burst. Shoot the file header for a file-wide violation. Shoot the tablet or press the completion key to mark the file reviewed. Click inside a completed file to reopen it. Use the configured shortcut to jump to the next unreviewed file. Hold right-click to erase a range. Hover a badge to isolate its lines.{/if}</p></div></div><div class="grid grid-cols-2 gap-x-6 gap-y-3.5 px-7 py-5 [&>div]:flex [&>div]:items-center [&>div]:gap-3 [&>div]:text-sm [&>div]:text-muted-foreground [&_kbd]:min-w-[78px] [&_kbd]:p-1 [&_kbd]:text-xs max-[760px]:gap-3 max-[760px]:[&_kbd]:min-w-[66px]">{#each bindings as [action, key]}<div><kbd>{key}</kbd><span>{action.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</span></div>{/each}</div><div class="flex gap-3 border-t border-border px-7 py-5 text-sm text-muted-foreground [&_svg]:mt-0.5 [&_svg]:shrink-0 [&_strong]:text-foreground"><Shield size={20} /><p><strong>{isDemo ? 'Reloading restarts this demo.' : 'Your progress is saved after every operation.'}</strong> Branch comparisons stay pinned. Working tree reviews follow live changes. Findings keep their original line range; remove or resolve them when you're satisfied.</p></div></Modal>{/if}
  </div>
{/if}
</div>
