import { describe, expect, it } from 'vitest';
import type { Snapshot, Finding } from '../types';
import { nextTutorialStep, reconcileTutorial, startTutorial, type TutorialSession } from './flow';

function fixture() {
  const finding: Finding = { id: 'finding-1', path: 'a.ts', code: 'V001', status: 'open', ranges: [{ side: 'additions', start: 3, end: 4 }], createdAt: '2026-10-02' };
  const snapshot = { review: { id: 'review-1', findings: [finding], reviewed: { 'a.ts': 'v1' }, dispatchedFindingIds: [] }, files: [
    { path: 'a.ts', revision: 'v1', additions: 10, deletions: 0, live: { number: 2 } },
    { path: 'b.ts', revision: 'v1', additions: 4, deletions: 0 }
  ] } as unknown as Snapshot;
  const session: TutorialSession = { ...startTutorial(snapshot), step: 'dispatch', findingId: finding.id };
  return { snapshot, finding, session };
}

describe('First steps return trip', () => {
  it('waits for dispatch, the actual agent result, and the explicit review handoff', () => {
    const { snapshot, session, finding } = fixture();
    expect(reconcileTutorial(session, snapshot, { demo: true })).toBe(session);
    snapshot.review.dispatchedFindingIds = [finding.id];
    const sent = reconcileTutorial(session, snapshot, { demo: true });
    expect(sent.step).toBe('agent');
    expect(nextTutorialStep(sent, snapshot)).toBe(sent);
    expect(reconcileTutorial(sent, snapshot, { demo: true })).toBe(sent);
    finding.status = 'resolved'; finding.resolution = 'Handled the missing value.';
    expect(reconcileTutorial(sent, snapshot, { demo: true })).toBe(sent);
    expect(reconcileTutorial(sent, snapshot, { demo: true, agentReviewed: true }).step).toBe('feedback');
  });
  it('requires reading this finding and opening its history before explaining the rounds', () => {
    const { snapshot, session, finding } = fixture();
    finding.status = 'resolved';
    let current: TutorialSession = { ...session, step: 'feedback' };
    expect(nextTutorialStep(current, snapshot)).toBe(current);
    expect(reconcileTutorial(current, snapshot, { inspectedFindingId: 'another-finding' })).toBe(current);
    current = reconcileTutorial(current, snapshot, { inspectedFindingId: finding.id });
    expect(current.feedbackInspected).toBe(true);
    finding.status = 'open';
    expect(reconcileTutorial(current, snapshot)).toBe(current);
    current = nextTutorialStep(current, snapshot);
    expect(current.step).toBe('history');
    expect(reconcileTutorial(current, snapshot)).toBe(current);
    current = reconcileTutorial(current, snapshot, { historyOpen: true });
    expect(current.step).toBe('rounds');
    expect(nextTutorialStep(current, snapshot).step).toBe('armory');
  });
  it('only completes after a confirmed V-code creation, and recovers from cancelling the form', () => {
    const { snapshot, session } = fixture();
    let current: TutorialSession = { ...session, step: 'armory' };
    expect(nextTutorialStep(current, snapshot)).toBe(current);
    current = reconcileTutorial(current, snapshot, { armoryOpen: true });
    expect(current.step).toBe('new-code');
    current = reconcileTutorial(current, snapshot, { armoryOpen: true, codeFormOpen: true });
    expect(current.step).toBe('create-code');
    expect(reconcileTutorial(current, snapshot, { armoryOpen: true, codeFormOpen: true })).toBe(current);
    expect(reconcileTutorial(current, snapshot, { armoryOpen: true, codeFormOpen: false }).step).toBe('new-code');
    expect(reconcileTutorial({ ...current, createdCode: 'V012' }, snapshot, { armoryOpen: true }).step).toBe('done');
  });
  it('teaches rules after a local dispatch without claiming an agent has run', () => {
    const { snapshot, session, finding } = fixture();
    snapshot.review.dispatchedFindingIds = [finding.id];
    expect(reconcileTutorial(session, snapshot).step).toBe('armory');
  });
  it('recovers when feedback has no surviving file or review history', () => {
    const { snapshot, session } = fixture();
    delete snapshot.files[0].live;
    expect(nextTutorialStep({ ...session, step: 'feedback', feedbackInspected: true }, snapshot).step).toBe('armory');
    snapshot.files = [];
    expect(reconcileTutorial({ ...session, step: 'feedback' }, snapshot).step).toBe('armory');
    snapshot.review.findings = [];
    expect(reconcileTutorial({ ...session, step: 'agent' }, snapshot, { agentReviewed: true }).step).toBe('armory');
    snapshot.review.id = 'new-review';
    expect(reconcileTutorial({ ...session, step: 'create-code', createdCode: 'V012' }, snapshot).step).toBe('briefing');
  });
  it('keeps marking and the optional nuke dependent on saved review state', () => {
    const { snapshot, finding } = fixture();
    snapshot.review.findings = []; snapshot.review.reviewed = {};
    const mark = nextTutorialStep(nextTutorialStep(startTutorial(snapshot)));
    expect(reconcileTutorial(mark, snapshot)).toBe(mark);
    snapshot.review.findings = [finding];
    const inspect = reconcileTutorial(mark, snapshot);
    expect(inspect.step).toBe('inspect');
    const nuke = nextTutorialStep(inspect, snapshot, true);
    expect(nuke.nuke?.path).toBe('b.ts');
    expect(reconcileTutorial(nuke, snapshot)).toBe(nuke);
    snapshot.review.reviewed['b.ts'] = 'v1';
    expect(reconcileTutorial(nuke, snapshot).step).toBe('review');
    snapshot.review.findings = [];
    expect(reconcileTutorial(inspect, snapshot).step).toBe('mark');
  });
});
