import type { Rule } from './config';
import type { Action, DiffFile, Finding, Snapshot } from './types';
import type { DiffRow } from './location';
import { applyFindingChanges, findingChanges, mergeStroke } from './finding-actions';

type Pending = {
  action: Action;
  reviewId: string;
  session: string;
  file?: DiffFile;
  rows: DiffRow[];
  rule?: Rule;
  at: string;
  sent: boolean;
  resolve: ((saved: boolean) => void)[];
};

export class ReviewActions {
  private snapshot?: Snapshot;
  private pending: Pending[] = [];
  private draining = false;

  constructor(private options: {
    send: (action: Action, reviewId: string) => Promise<void>;
    view: (path: string) => DiffFile | undefined;
    rows: (file: DiffFile) => DiffRow[];
    rule: (code: string) => Rule | undefined;
    change: (findings: Finding[], pending: number) => void;
    error: (error: unknown) => void;
  }) {}

  receive(snapshot: Snapshot) {
    this.snapshot = snapshot;
    this.publish();
  }

  enqueue(input: Action): Promise<boolean> {
    if (!this.snapshot) return Promise.resolve(false);
    const stroke = input.type === 'shoot' || input.type === 'erase';
    const action = stroke ? { ...input, mutationId: crypto.randomUUID() } : input;
    const file = 'aim' in action ? this.options.view(action.aim.path) : undefined;
    const rows = file ? this.options.rows(file) : [];
    const review = this.snapshot.review;
    const promise = new Promise<boolean>(resolve => {
      const tail = this.pending.at(-1);
      const merged = stroke && tail && !tail.sent && tail.reviewId === review.id && tail.session === review.createdAt
        && (tail.action.type === 'shoot' || tail.action.type === 'erase')
        ? mergeStroke(tail.action, action as Extract<Action, { type: 'shoot' | 'erase' }>, rows) : undefined;
      if (merged) { tail!.action = merged; tail!.resolve.push(resolve); }
      else this.pending.push({ action, file, rows, reviewId: review.id, session: review.createdAt, rule: action.type === 'shoot' ? this.options.rule(action.code) : undefined, at: new Date().toISOString(), sent: false, resolve: [resolve] });
    });
    this.publish();
    void this.drain();
    return promise;
  }

  private current(entry: Pending) {
    return entry.reviewId === this.snapshot?.review.id && entry.session === this.snapshot.review.createdAt;
  }

  private publish() {
    let findings = this.snapshot?.review.findings || [];
    for (const entry of this.pending) {
      if (!this.current(entry)) continue;
      const { action, file, rows, rule, at } = entry;
      if (action.type === 'delete') findings = findings.filter(finding => finding.id !== action.id);
      else if ((action.type === 'shoot' || action.type === 'erase') && file
        && this.snapshot?.files.some(current => current.path === file.path && current.revision === file.revision)
        && (action.type !== 'shoot' || (rule && rule.active !== false))) {
        findings = applyFindingChanges(findings, findingChanges(findings, action, file, rows, rule, at, () => action.mutationId!));
      }
    }
    this.options.change(findings, this.pending.length);
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length) {
        const entry = this.pending[0];
        entry.sent = true;
        let saved = false;
        try {
          if (this.current(entry)) { await this.options.send(entry.action, entry.reviewId); saved = true; }
        } catch (error) { this.options.error(error); }
        this.pending.shift();
        // The authoritative snapshot stays separate from the preview. Rebase
        // remaining inputs after SSE/HTTP acknowledgements or rejected writes.
        this.publish();
        for (const resolve of entry.resolve) resolve(saved);
      }
    } finally { this.draining = false; }
  }
}
