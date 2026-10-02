<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Config } from '$lib/config';
  import type { Snapshot } from '$lib/types';
  import type { AvatarPresentation } from '$lib/avatar/presentation';
  import { activeBindings } from '$lib/experience';
  import { tutorialContent, type TutorialDialogGuide, type TutorialGuideOptions } from '$lib/tutorial/content';
  import { nextTutorialStep, reconcileTutorial, startTutorial, tutorialDismissed, tutorialFile, tutorialSteps, tutorialStorageKey, tutorialRestartKey, type TutorialOutcome, type TutorialSession } from '$lib/tutorial/flow';
  import TutorialGuide from './TutorialGuide.svelte';

  let { snapshot, config, presentation, ready, suspended, paused = false, holding, pending, demo, preview = false, code, nukeAvailable = false, nukeMark,
    armoryOpen = false, outboxOpen = false, agentPhase = 'idle', agentReviewed = false, inspectedFindingId,
    active = $bindable(false), focus = $bindable(), dialogGuide = $bindable(), onreveal, onconfigureNuke, onarmory, onoutbox, oncloseFinding }: {
    snapshot: Snapshot; config: Config; presentation: AvatarPresentation; ready: boolean; suspended: boolean;
    holding: boolean; pending: boolean; demo: boolean; preview?: boolean; code?: string; nukeAvailable?: boolean; nukeMark?: string; active?: boolean;
    paused?: boolean; armoryOpen?: boolean; outboxOpen?: boolean; agentPhase?: 'idle' | 'running' | 'complete' | 'error'; agentReviewed?: boolean; inspectedFindingId?: string;
    focus?: string; dialogGuide?: TutorialDialogGuide;
    onreveal: (path: string) => void; onconfigureNuke?: () => void; onarmory: (open: boolean) => void; onoutbox: () => void; oncloseFinding: () => void;
  } = $props();
  let session = $state<TutorialSession>();
  const step = $derived(session?.step);
  let loaded = $state(false), dismissed = $state(false), restartOnLaunch = $state(false);
  const bindings = $derived(activeBindings(config));
  let historyOpen = $state(false), codeFormOpen = $state(false);
  const content = $derived(tutorialContent({ demo, game: config.experience.mode === 'game', code, nukeMark, agentPhase, feedbackInspected: session?.feedbackInspected, createdCode: session?.createdCode,
    shortcut: command => bindings.find(([name]) => name === command)?.[1] || '' }));
  const finding = $derived(snapshot.review.findings.find(finding => finding.id === session?.findingId));
  const availableFile = $derived(tutorialFile(snapshot));
  const path = $derived(session?.step === 'nuke' ? session.nuke?.path : finding?.path || availableFile?.path);
  const steps = $derived(tutorialSteps.filter(step => (step !== 'nuke' || nukeAvailable || session?.step === 'nuke') && (demo || !['agent', 'feedback', 'history', 'rounds'].includes(step))));
  const host = $derived(session?.step === 'agent' && outboxOpen ? 'agent' : armoryOpen && session && ['new-code', 'create-code', 'done'].includes(session.step) ? 'armory' : undefined);
  const hidden = $derived(suspended || (paused || armoryOpen || outboxOpen) && !host);
  const guide = $derived<TutorialGuideOptions>({ message: content[session?.step || 'briefing'], step: session?.step || 'briefing', index: session ? steps.indexOf(session.step) : 0, total: steps.length - 1,
    target, targetScope, onnext: next, onskip: skip, onreveal: reveal, onaction: onconfigureNuke });

  onMount(() => {
    if (preview || demo) { loaded = true; return; }
    try {
      dismissed = tutorialDismissed(localStorage.getItem(tutorialStorageKey));
      restartOnLaunch = localStorage.getItem(tutorialRestartKey) === 'true';
    } catch { /* Keep the choice for this visit when storage is unavailable. */ }
    loaded = true;
    const changed = (event: StorageEvent) => {
      if (event.key === tutorialStorageKey && tutorialDismissed(event.newValue)) { dismissed = true; session = undefined; }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  });
  $effect(() => {
    if (loaded && ready && !hidden && (!dismissed || restartOnLaunch) && !session && availableFile && code) {
      let replay = restartOnLaunch;
      if (replay) {
        try {
          // Settings may cancel a queued replay while we wait for a playable diff.
          replay = localStorage.getItem(tutorialRestartKey) === 'true';
          if (replay) localStorage.removeItem(tutorialRestartKey);
        } catch { /* Still honor the request for this visit. */ }
        restartOnLaunch = false;
      }
      if (!dismissed || replay) session = startTutorial(snapshot);
    }
  });
  $effect(() => { active = !!session; });
  $effect(() => { focus = session && ['dispatch', 'agent', 'feedback', 'history', 'rounds'].includes(session.step) ? finding?.path : undefined; });
  $effect(() => { dialogGuide = session && host && ready && !hidden ? { host, guide } : undefined; });
  $effect(() => {
    session?.step; path;
    if (!session || !['history', 'new-code', 'create-code'].includes(session.step)) return;
    const update = () => {
      historyOpen = !!targetFile()?.querySelector('[data-tutorial="history"][aria-expanded="true"]');
      codeFormOpen = !!document.querySelector('[data-tutorial="create-code"]');
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-expanded'] });
    update();
    return () => observer.disconnect();
  });
  $effect(() => {
    if (!session || !ready || holding || pending) return;
    const next = session.step === 'nuke' && !nukeAvailable ? { ...session, step: 'review' as const } : reconcileTutorial(session, snapshot, { demo, agentReviewed, inspectedFindingId, historyOpen, armoryOpen, codeFormOpen });
    if (next !== session) {
      session = next;
      if (next.step === 'done') untrack(() => remember('completed'));
    }
  });
  $effect(() => {
    if (step && ['mark', 'nuke', 'review', 'feedback', 'history'].includes(step) && path) untrack(() => onreveal(path));
  });
  function remember(outcome: TutorialOutcome) {
    dismissed = true;
    try { if (!preview && !demo) localStorage.setItem(tutorialStorageKey, outcome); } catch { /* Dismiss for this visit even when browser storage is disabled. */ }
  }
  function skip() { remember('skipped'); session = undefined; }
  export function restart() { session = startTutorial(snapshot); }
  export function codeCreated(id: string) {
    if (session?.step === 'create-code') session = { ...session, createdCode: id };
  }
  function reveal() {
    if (session?.step === 'agent') onoutbox();
    else if (session && ['armory', 'new-code', 'create-code'].includes(session.step)) onarmory(true);
    else if (path) onreveal(path);
  }
  function next() {
    if (!session) return;
    if (session.step === 'done') { session = undefined; onarmory(false); return; }
    if (session.step === 'feedback') oncloseFinding();
    session = nextTutorialStep(session, snapshot, nukeAvailable);
  }
  function visible(element: Element) {
    const rect = element.getBoundingClientRect();
    const scroll = document.querySelector('.diff-scroll');
    const ceiling = scroll ? scroll.getBoundingClientRect().top + (parseFloat(getComputedStyle(scroll).scrollPaddingTop) || 0) : 0;
    const floor = document.querySelector('.game-hud')?.getBoundingClientRect().top ?? innerHeight;
    return rect.width > 0 && rect.height > 0 && rect.top >= ceiling && rect.bottom <= floor && rect.right > 0 && rect.left < innerWidth;
  }
  function targetFile() {
    return Array.from(document.querySelectorAll<HTMLElement>('.review-file[data-ready="true"]')).find(file => file.dataset.filePath === path);
  }
  function targetScope() {
    const file = targetFile();
    return file?.querySelector('diffs-container')?.shadowRoot || file;
  }
  function target(): Element | undefined {
    if (!session) return;
    if (session.step === 'agent') {
      if (!outboxOpen) return;
      return (agentPhase === 'running' ? document.querySelector('[data-tutorial="agent-terminal"]')
        : document.querySelector('[data-tutorial="agent-review"]') || document.querySelector('[data-tutorial="agent-run"]')) || undefined;
    }
    if (session.step === 'armory') return document.querySelector('[aria-label="Open rules"]') || undefined;
    if (session.step === 'new-code') return armoryOpen ? document.querySelector('[data-tutorial="new-code"]') || undefined : undefined;
    if (session.step === 'create-code') return armoryOpen ? document.querySelector('[data-tutorial="create-code"] button[type="submit"]') || undefined : undefined;
    if (session.step === 'loadout') return document.querySelector(config.experience.mode === 'game' ? '.game-hud .right-panel' : '[aria-label="Open rules"]') || undefined;
    if (session.step === 'dispatch') return document.querySelector('.dispatch-button') || undefined;
    if (session.step === 'briefing' || session.step === 'done') return;
    const file = targetFile();
    if (session.step === 'history') return file?.querySelector('[data-tutorial="history"]') || undefined;
    if (session.step === 'rounds') return file?.querySelector('.file-revision-controls') || undefined;
    if (session.step === 'nuke' || session.step === 'review') {
      const control = file?.querySelector(session.step === 'nuke' ? '.file-nuke' : '[data-complete-file]');
      return control && visible(control) ? control : undefined;
    }
    if (session.step === 'inspect' || session.step === 'feedback') return Array.from(document.querySelectorAll<HTMLElement>('.range-badge[data-finding-id]')).find(badge => badge.dataset.findingId === session?.findingId && visible(badge));
    // Diff rows live in a shadow root. Anchor to a visible changed line, not a virtual placeholder.
    const root = file?.querySelector('diffs-container')?.shadowRoot;
    return Array.from(root?.querySelectorAll('[data-line-type="change-addition"][data-line], [data-line-type="change-deletion"][data-line]') || []).find(visible)
      || Array.from(root?.querySelectorAll('[data-line]') || []).find(visible);
  }
</script>

{#if session && ready && !hidden && !host}
  <TutorialGuide {...guide} {presentation} reducedMotion={config.display.reducedMotion} />
{/if}
