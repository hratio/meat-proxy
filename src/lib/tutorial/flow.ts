import type { Finding, Snapshot } from '../types';

export const tutorialStorageKey = 'meat-proxy:first-steps:v1';
export const tutorialRestartKey = 'meat-proxy:first-steps:restart:v1';
export type TutorialOutcome = 'skipped' | 'completed';
export const tutorialSteps = ['briefing', 'loadout', 'mark', 'inspect', 'nuke', 'review', 'dispatch', 'agent', 'feedback', 'history', 'rounds', 'armory', 'new-code', 'create-code', 'done'] as const;
export type TutorialStep = typeof tutorialSteps[number];
export type TutorialSession = {
  step: TutorialStep;
  reviewId: string;
  baseline: Record<string, string>;
  findingId?: string;
  nuke?: { path: string; revision: string };
  feedbackInspected?: boolean;
  createdCode?: string;
};
export type TutorialProgress = {
  demo?: boolean; agentReviewed?: boolean; inspectedFindingId?: string;
  historyOpen?: boolean; armoryOpen?: boolean; codeFormOpen?: boolean;
};

const fingerprint = (finding: Finding) => JSON.stringify([finding.path, finding.code, finding.ranges, finding.status]);

export function tutorialDismissed(value: string | null): boolean {
  return value === 'skipped' || value === 'completed';
}

export function tutorialFile(snapshot: Snapshot) {
  return snapshot.files.find(file => !file.binary && !file.omitted && file.additions + file.deletions > 0
    && snapshot.review.reviewed[file.path] !== file.revision);
}

export function startTutorial(snapshot: Snapshot): TutorialSession {
  return { step: 'briefing', reviewId: snapshot.review.id,
    baseline: Object.fromEntries(snapshot.review.findings.map(finding => [finding.id, fingerprint(finding)])) };
}

/** Only confirmed review state advances an action step. Old findings don't count. */
export function reconcileTutorial(session: TutorialSession, snapshot: Snapshot, progress: TutorialProgress = {}): TutorialSession {
  if (session.reviewId !== snapshot.review.id) return startTutorial(snapshot);
  if (session.step === 'armory') return progress.armoryOpen ? { ...session, step: 'new-code' } : session;
  if (session.step === 'new-code') return progress.codeFormOpen ? { ...session, step: 'create-code' } : session;
  if (session.step === 'create-code') return session.createdCode ? { ...session, step: 'done' } : progress.armoryOpen && !progress.codeFormOpen ? { ...session, step: 'new-code' } : session;
  if (session.step === 'mark') {
    const finding = snapshot.review.findings.find(finding => finding.code && finding.status === 'open'
      && finding.ranges?.length && fingerprint(finding) !== session.baseline[finding.id]);
    return finding ? { ...session, step: 'inspect', findingId: finding.id } : session;
  }
  if (!session.findingId || session.step === 'done') return session;
  // Sending is only the handoff. The demo teaches the return trip as well.
  if (session.step === 'dispatch' && snapshot.review.dispatchedFindingIds?.includes(session.findingId)) return { ...session, step: progress.demo ? 'agent' : 'armory' };
  const finding = snapshot.review.findings.find(finding => finding.id === session.findingId);
  if (session.step === 'agent') {
    if (!progress.agentReviewed) return session;
    return { ...session, step: finding?.status === 'resolved' && snapshot.files.some(file => file.path === finding.path) ? 'feedback' : 'armory' };
  }
  if (['feedback', 'history', 'rounds'].includes(session.step)) {
    if (!finding || !snapshot.files.some(file => file.path === finding.path)) return { ...session, step: 'armory' };
    if (session.step === 'feedback' && !session.feedbackInspected && progress.inspectedFindingId === session.findingId) return { ...session, feedbackInspected: true };
    if (session.step === 'history' && progress.historyOpen) return { ...session, step: 'rounds' };
    return session;
  }
  // Undo or an early manual resolution still recovers the first marking lesson.
  if (finding?.status !== 'open') return { ...startTutorial(snapshot), step: 'mark' };
  if (session.step === 'nuke') {
    const target = snapshot.files.find(file => file.path === session.nuke?.path);
    // A finished, removed, or changed target returns to the original finding.
    if (!target || target.revision !== session.nuke?.revision || snapshot.review.reviewed[target.path] === target.revision) return { ...session, step: 'review' };
  }
  const file = snapshot.files.find(file => file.path === finding.path);
  const reviewed = !!file && snapshot.review.reviewed[file.path] === file.revision;
  if (session.step === 'review' && reviewed) return { ...session, step: 'dispatch' };
  if (session.step === 'dispatch' && !reviewed) return { ...session, step: 'review' };
  return session;
}

export function nextTutorialStep(session: TutorialSession, snapshot?: Snapshot, offerNuke = false): TutorialSession {
  if (session.step === 'feedback' && session.feedbackInspected) {
    const finding = snapshot?.review.findings.find(finding => finding.id === session.findingId);
    return { ...session, step: snapshot?.files.some(file => file.path === finding?.path && file.live && file.live.number > 1) ? 'history' : 'armory' };
  }
  if (session.step === 'inspect' && snapshot && offerNuke) {
    const path = snapshot.review.findings.find(finding => finding.id === session.findingId)?.path;
    const index = snapshot.files.findIndex(file => file.path === path);
    // Prefer the next eligible file, wrapping to the first one only when needed.
    const files = [...snapshot.files.slice(index + 1), ...snapshot.files.slice(0, index + 1)];
    const file = tutorialFile({ ...snapshot, files });
    if (file) return { ...session, step: 'nuke', nuke: { path: file.path, revision: file.revision } };
  }
  const next = { briefing: 'loadout', loadout: 'mark', inspect: 'review', nuke: 'review', rounds: 'armory' } as const;
  return session.step in next ? { ...session, step: next[session.step as keyof typeof next] } : session;
}

export function bindingLabel(binding: string) {
  return binding.split('+').map(key => ({ mouse1: 'Left mouse', mouse2: 'Middle mouse', mouse3: 'Right mouse',
    space: 'Space', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→' }[key.toLowerCase()] ||
    (key.length === 1 ? key.toUpperCase() : key[0]?.toUpperCase() + key.slice(1)))).join(' + ');
}
