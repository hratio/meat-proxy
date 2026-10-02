import type { Config } from '../config';
import type { Comparison, DiffFile, FileComparison, FileHistoryEntry, FileReviewRound, FileState, FileVersion, Finding, LiveFile, Review } from '../types';
import { fileContents } from './contents';
import { sealRound, reopenRound } from './rounds';
import { mapLimit } from './concurrency';
const randomUUID = () => crypto.randomUUID();

export abstract class ReviewVersions {
  private pending = new Map<string, { id: string; since: number }>();
  private paths: string[] = [];
  constructor(readonly directory: string, protected review: Review, protected config: Config) {}
  protected abstract readHeads(paths: string[], head: string): Promise<Map<string, FileState>>;
  protected abstract readWorking(path: string): Promise<FileState>;
  protected abstract readSnapshot(state: FileState): Promise<string>;
  protected abstract diff(path: string, before: FileState, after: FileState): Promise<DiffFile>;
  protected abstract reuseDiscovered(path: string, before: FileState, after: FileState, file: DiffFile): void;
  abstract collectUnused(): Promise<void>;

  configure(config: Config) { this.config = config; }

  async readHead(path: string, head: string): Promise<FileState> {
    return (await this.readHeads([path], head)).get(path)!;
  }

  async isCurrent(path: string) {
    const current = this.review.fileHistory[path]?.versions.at(-1);
    return !!current && current.state.id === (await this.readWorking(path)).id;
  }

  async refresh(headFiles: DiffFile[], headOid: string, force = false) {
    const changedAtHead = new Map(headFiles.map(file => [file.path, file]));
    const findingPaths = new Set(this.review.findings.map(finding => finding.path));
    const watched = Object.entries(this.review.fileHistory).filter(([path, history]) =>
      this.review.fileRounds[path]?.length || findingPaths.has(path) || history.versions.at(-1)?.state.id !== history.head.id
    ).map(([path]) => path);
    const paths = [...new Set([...changedAtHead.keys(), ...watched])];
    let unsettled = false;
    const bases = await this.readHeads(paths, headOid);
    await mapLimit(paths, 8, async path => {
      const state = await this.readWorking(path), base = bases.get(path)!;
      let history = this.review.fileHistory[path];
      if (!history) history = this.review.fileHistory[path] = { versions: [], nextNumber: 1, head: base, headOid, states: {} };
      history.head = base;
      history.headOid = headOid;
      history.states[base.id] = base;
      const previous = history.versions.at(-1);
      if (previous?.state.id !== state.id) {
        let pending = this.pending.get(path);
        if (!pending || pending.id !== state.id) {
          pending = { id: state.id, since: Date.now() };
          this.pending.set(path, pending);
        }
        if (!previous || force || Date.now() - pending.since >= this.config.review.changeSettleMs) {
          history.states[state.id] = state;
          history.versions.push({ id: randomUUID(), number: history.nextNumber++, at: new Date().toISOString(), headOid, state, base });
          this.pending.delete(path);
          // An old completed patch is recoverable only when it is exactly this
          // HEAD comparison. Other legacy marks remain safely uncompleted.
          const legacyRevision = changedAtHead.get(path)?.revision;
          if (!previous && legacyRevision) this.migrateCompletion(path, legacyRevision, history.versions.at(-1)!);
        } else unsettled = true;
      } else this.pending.delete(path);
      const discovered = changedAtHead.get(path);
      // Git discovery and file capture can race an editor. Reuse a patch only
      // when both full object IDs AND file modes match the captured snapshots.
      if (discovered) this.reuseDiscovered(path, base, state, discovered);
    });
    this.paths = paths;
    return { files: await this.views(), unsettled };
  }

  // Findings and completion change the presentation of captured versions, not
  // their contents. Reuse those versions instead of reading the worktree again.

  async views() {
    // Carried findings stay available in the log and their original snapshots,
    // but do not bring committed files back into the fresh review's counters.
    const carried = new Set(this.review.carriedFindingIds);
    const findingPaths = new Set(this.review.findings.filter(finding => !carried.has(finding.id)).map(finding => finding.path));
    // Undo can restore the last finding or round on a file that the previous
    // poll stopped watching after it returned to HEAD.
    const restored = Object.keys(this.review.fileHistory).filter(path => findingPaths.has(path) || this.review.fileRounds[path]?.length);
    const paths = [...new Set([...this.paths, ...restored])].filter(path => {
      const history = this.review.fileHistory[path];
      // Retain reversions to HEAD while a completed baseline or finding exists.
      return history.versions.at(-1)!.state.id !== history.head.id || this.pending.has(path) || this.review.fileRounds[path]?.length || findingPaths.has(path);
    });
    return mapLimit(paths, 8, path => this.view(path));
  }

  private migrateCompletion(path: string, legacyRevision: string, version: FileVersion) {
    const rounds = sealRound([], version.id, {
      kind: 'latest', base: version.base.id, head: version.state.id, baseLabel: 'HEAD', headLabel: 'Live'
    }, version.at);
    if (this.review.reviewed[path] === legacyRevision) {
      this.review.reviewed[path] = version.id;
      this.review.fileRounds[path] = rounds;
    }
    if (this.review.checkpoint.reviewed[path] === legacyRevision) {
      this.review.checkpoint.reviewed[path] = version.id;
      this.review.checkpoint.fileRounds[path] = rounds;
    }
    let previous: FileReviewRound[] = [];
    for (const [index, operation] of this.review.history.entries()) {
      for (const change of [...operation.changes]) {
        if (change.kind !== 'reviewed' || change.path !== path) continue;
        if (change.before === legacyRevision) change.before = version.id;
        if (change.after === legacyRevision) {
          change.after = version.id;
          operation.changes.push({ kind: 'file-rounds', path, before: previous, after: rounds });
          previous = rounds;
        } else if (!change.after && previous.length) {
          const reopened = reopenRound(previous);
          operation.changes.push({ kind: 'file-rounds', path, before: previous, after: reopened });
          previous = reopened;
        } else if (change.after) previous = [];
        if (index < this.review.cursor && previous.length) this.review.fileRounds[path] = previous;
      }
    }
  }

  private currentRound(path: string) {
    const history = this.review.fileHistory[path];
    if (!history) throw new Error('No local history for this file.');
    const current = history.versions.at(-1)!;
    const rounds = this.review.fileRounds[path] || [];
    const last = rounds.at(-1);
    const round = last && (!last.completedAt || last.version === current.id) ? last : undefined;
    const previous = round ? rounds.at(-2) : last;
    const number = round?.number || (previous?.number || 0) + 1;
    const base = history.states[round?.comparison.base || previous?.comparison.head || history.head.id];
    const baseLabel = round?.comparison.baseLabel || (previous ? `Review ${previous.number}` : 'HEAD');
    const live: LiveFile = {
      version: current.id, head: history.head.id, round: round?.id || 'live', number,
      count: rounds.length + (round ? 0 : 1), completed: !!round?.completedAt
    };
    return { history, current, rounds, round, base, baseLabel, live };
  }

  entries(path: string): FileHistoryEntry[] {
    const { rounds, round, baseLabel, live } = this.currentRound(path);
    const entries = rounds.map(r => ({
      id: r.id, number: r.number, completedAt: r.completedAt, current: r.id === live.round,
      baseLabel: r.comparison.baseLabel, headLabel: r.completedAt ? `Review ${r.number}` : 'Live'
    }));
    if (!round) entries.push({ id: 'live', number: live.number, completedAt: undefined, current: true, baseLabel, headLabel: 'Live' });
    return entries;
  }

  async completedRounds(path: string, at: string) {
    const file = await this.view(path);
    return sealRound(this.review.fileRounds[path] || [], file.revision, file.comparison!, at);
  }

  async view(path: string, kind: 'latest' | 'head' | 'history' = 'latest', roundId?: string): Promise<DiffFile> {
    const state = this.currentRound(path);
    const { history, rounds, current, live } = state;
    let version = current, base = state.base, baseLabel = state.baseLabel, round = live.round;
    let headLabel = live.completed ? `Review ${live.number}` : 'Live';
    if (kind === 'history') {
      const completed = rounds.find(r => r.id === roundId && r.completedAt);
      if (!completed) throw new Error('This review round is no longer complete. Return to the current round.');
      version = history.versions.find(v => v.id === completed.version)!;
      base = history.states[completed.comparison.base];
      baseLabel = completed.comparison.baseLabel;
      headLabel = `Review ${completed.number}`;
      round = completed.id;
    } else if (kind === 'head') {
      base = history.head;
      baseLabel = 'HEAD';
      headLabel = 'Current file';
    }
    const comparison: FileComparison = { kind, base: base.id, head: version.state.id, baseLabel, headLabel };
    const file = await this.diff(path, base, version.state);
    // Review rounds can have a different baseline; sidebar totals always use HEAD.
    const headDiff = kind === 'latest' ? await this.diff(path, history.head, current.state) : undefined;
    const selectionDelta = headDiff ? { additions: headDiff.additions, deletions: headDiff.deletions } : undefined;
    return { ...file, revision: version.id, comparison, round, live, selectionDelta };
  }

  async findingView(finding: Finding): Promise<DiffFile> {
    const history = this.review.fileHistory[finding.path];
    const version = history?.versions.find(v => v.id === finding.version);
    const base = finding.comparison && history?.states[finding.comparison.base];
    const head = finding.comparison && history?.states[finding.comparison.head];
    if (!version || !base || !head) throw new Error('This finding predates the retained file history.');
    const state = this.currentRound(finding.path);
    const { rounds, live, current } = state;
    // Reuse a named view when both sides still match. A finding created in
    // the open round must not turn the current file into an unnamed history view.
    if (base.id === state.base.id && head.id === current.state.id) return this.view(finding.path);
    if (base.id === history.head.id && head.id === current.state.id) return this.view(finding.path, 'head');
    const round = rounds.find(r => r.completedAt && r.comparison.base === base.id && r.comparison.head === head.id);
    if (round) return this.view(finding.path, 'history', round.id);
    const baseRound = rounds.find(r => r.completedAt && r.comparison.head === base.id);
    return { ...await this.diff(finding.path, base, head), revision: version.id, live,
      comparison: {
        kind: 'history', base: base.id, head: head.id,
        baseLabel: baseRound ? `Review ${baseRound.number}` : base.id === version.base.id ? 'HEAD snapshot' : 'Finding baseline',
        headLabel: 'Finding snapshot'
      } };
  }

  async contents(path: string, comparison: Comparison) {
    const history = this.review.fileHistory[path];
    const read = async (id: string) => {
      const state = history?.states[id];
      if (!state) throw new Error('This file snapshot is no longer available.');
      if (state.binary || state.omitted) throw new Error(state.omitted || 'Binary files cannot be expanded.');
      return state.exists ? this.readSnapshot(state) : '';
    };
    const [before, after] = await Promise.all([read(comparison.base), read(comparison.head)]);
    return fileContents(path, comparison, before, after);
  }

  prune() {
    const referenced = new Set<string>();
    const visit = (value: unknown) => {
      if (typeof value === 'string') referenced.add(value);
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(this.review.findings); visit(this.review.fileRounds); visit(this.review.checkpoint); visit(this.review.history);
    for (const history of Object.values(this.review.fileHistory)) {
      const keep = new Set(history.versions.slice(-this.config.review.versionLimit).map(v => v.id));
      history.versions = history.versions.filter((v, index) => index === 0 || keep.has(v.id) || referenced.has(v.id) || referenced.has(v.state.id));
      const states = new Set([history.head.id, ...history.versions.flatMap(v => [v.state.id, v.base.id])]);
      for (const id of Object.keys(history.states)) if (!states.has(id) && !referenced.has(id)) delete history.states[id];
    }
  }
}
