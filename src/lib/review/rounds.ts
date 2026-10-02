const randomUUID = () => crypto.randomUUID();
import type { Change, FileComparison, FileReviewRound, Operation, Review, ReviewContent } from '$lib/types';

// Content snapshots can change many times during one review round. Only a
// completion seals its endpoint; reopening resumes the same round and baseline.
export function sealRound(rounds: FileReviewRound[], version: string, comparison: FileComparison, at: string): FileReviewRound[] {
  const last = rounds.at(-1);
  if (last?.completedAt && last.version === version) return rounds;
  const open = last && !last.completedAt ? last : undefined;
  const number = open?.number || (last?.number || 0) + 1;
  const round: FileReviewRound = {
    id: open?.id || randomUUID(), number, version, completedAt: at,
    comparison: { ...comparison, kind: 'latest', headLabel: `Review ${number}` }
  };
  return [...(open ? rounds.slice(0, -1) : rounds), round];
}

export function reopenRound(rounds: FileReviewRound[]): FileReviewRound[] {
  const last = rounds.at(-1);
  if (!last?.completedAt) return rounds;
  return [...rounds.slice(0, -1), { ...last, completedAt: undefined }];
}

type LegacyCheckpoint = { version: string; comparison: FileComparison };
type LegacyContent = Omit<ReviewContent, 'fileRounds'> & { fileCheckpoints: Record<string, LegacyCheckpoint> };
type LegacyChange = Exclude<Change, { kind: 'file-rounds' }> | { kind: 'file-checkpoint'; path: string; before?: LegacyCheckpoint; after?: LegacyCheckpoint };
type LegacyReview = Omit<Review, 'version' | 'fileRounds' | 'checkpoint' | 'history'> & LegacyContent & {
  version: number; checkpoint: LegacyContent; history: (Omit<Operation, 'changes'> & { changes: LegacyChange[] })[];
};

export function migrateReviewRounds(legacy: LegacyReview): Review {
  type Completion = { checkpoint: LegacyCheckpoint; at: string; previous?: LegacyCheckpoint; linked: boolean };
  const completions = new Map<string, Map<string, Completion>>();
  const remember = (path: string, checkpoint: LegacyCheckpoint | undefined, at: string, previous?: LegacyCheckpoint, linked = false) => {
    if (!checkpoint) return;
    let known = completions.get(path);
    if (!known) completions.set(path, known = new Map());
    const existing = known.get(checkpoint.version);
    // Repeated complete/reopen clicks on unchanged content are one round.
    if (previous?.version === checkpoint.version) linked = false;
    if (!existing || (linked && !existing.linked)) known.set(checkpoint.version, { checkpoint, at, previous, linked });
  };
  for (const state of [legacy, legacy.checkpoint]) {
    for (const [path, checkpoint] of Object.entries(state.fileCheckpoints)) remember(path, checkpoint, legacy.updatedAt);
  }
  for (const operation of legacy.history) {
    for (const change of operation.changes) if (change.kind === 'file-checkpoint') {
      remember(change.path, change.before, operation.at);
      remember(change.path, change.after, operation.at, change.before, true);
    }
  }

  // Recover completed boundaries from checkpoint records, never from every
  // captured save. The original snapshots and finding comparisons stay intact.
  const recover = (path: string, checkpoint?: LegacyCheckpoint, seen = new Set<string>()): FileReviewRound[] => {
    const history = legacy.fileHistory[path];
    const version = history?.versions.find(v => v.id === checkpoint?.version);
    if (!checkpoint || !version || seen.has(version.id)) return [];
    seen.add(version.id);
    const record = completions.get(path)?.get(version.id);
    let previous = record?.previous;
    if (!record?.linked && checkpoint.comparison.baseLabel.startsWith('Reviewed ')) {
      const base = history.versions.find(v => v.number < version.number && v.state.id === checkpoint.comparison.base);
      if (base) previous = completions.get(path)?.get(base.id)?.checkpoint || {
        version: base.id,
        comparison: { kind: 'latest', base: base.base.id, head: base.state.id, baseLabel: 'HEAD', headLabel: '' }
      };
    }
    const rounds = recover(path, previous, seen);
    const last = rounds.at(-1);
    const number = (last?.number || 0) + 1;
    return [...rounds, {
      id: version.id, number, version: version.id, completedAt: record?.at || version.at,
      comparison: {
        kind: 'latest', base: last?.comparison.head || checkpoint.comparison.base, head: version.state.id,
        baseLabel: last ? `Review ${last.number}` : 'HEAD', headLabel: `Review ${number}`
      }
    }];
  };

  const running: Record<string, FileReviewRound[]> = {};
  const atCursor: Record<string, FileReviewRound[]> = {};
  const sealed = new Map<string, FileReviewRound[]>();
  const history: Operation[] = legacy.history.map((operation, index) => {
    const changes: Change[] = operation.changes.filter((change): change is Exclude<LegacyChange, { kind: 'file-checkpoint' }> => change.kind !== 'file-checkpoint');
    const paths = new Set(operation.changes.flatMap(change => 'path' in change ? [change.path] : []));
    for (const path of paths) {
      const checkpoint = operation.changes.find((change): change is Extract<LegacyChange, { kind: 'file-checkpoint' }> => change.kind === 'file-checkpoint' && change.path === path);
      const reviewed = operation.changes.find((change): change is Extract<LegacyChange, { kind: 'reviewed' }> => change.kind === 'reviewed' && change.path === path);
      if (!(path in running)) {
        const before = checkpoint ? checkpoint.before : reviewed?.before ? completions.get(path)?.get(reviewed.before)?.checkpoint : undefined;
        running[path] = recover(path, before);
        if (before && reviewed && !reviewed.before && reviewed.after === before.version) running[path] = reopenRound(running[path]);
      }
      const before = running[path];
      let after = before;
      if (checkpoint?.after) {
        const version = legacy.fileHistory[path]?.versions.find(v => v.id === checkpoint.after!.version);
        if (version) {
          const last = before.at(-1);
          const base = last ? last.completedAt ? last.comparison.head : last.comparison.base : checkpoint.after.comparison.base;
          const baseLabel = last ? last.completedAt ? `Review ${last.number}` : last.comparison.baseLabel : 'HEAD';
          after = sealRound(before, version.id, { kind: 'latest', base, head: version.state.id, baseLabel, headLabel: '' }, operation.at);
          sealed.set(`${path}:${version.id}`, after);
        }
      } else if (checkpoint) after = [];
      else if (reviewed?.before && !reviewed.after && before.at(-1)?.version === reviewed.before) after = reopenRound(before);
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ kind: 'file-rounds', path, before, after });
      running[path] = after;
      if (index < legacy.cursor) atCursor[path] = after;
      else if (!(path in atCursor)) atCursor[path] = before;
    }
    return { ...operation, changes };
  });

  const migrateContent = (state: LegacyContent, current: boolean): ReviewContent => {
    const { fileCheckpoints } = state;
    const fileRounds: Record<string, FileReviewRound[]> = {};
    for (const [path, checkpoint] of Object.entries(fileCheckpoints)) {
      let rounds = current && atCursor[path]?.at(-1)?.version === checkpoint.version
        ? atCursor[path]
        : sealed.get(`${path}:${checkpoint.version}`) || recover(path, checkpoint);
      const version = legacy.fileHistory[path]?.versions.at(-1);
      if (state.reviewed[path] !== checkpoint.version && version?.id === checkpoint.version) rounds = reopenRound(rounds);
      if (rounds.length) fileRounds[path] = structuredClone(rounds);
    }
    return { findings: state.findings, reviewed: state.reviewed, fileRounds, ...(state.finishedAt ? { finishedAt: state.finishedAt } : {}) };
  };
  const content = migrateContent(legacy, true);
  const checkpoint = migrateContent(legacy.checkpoint, false);
  const legacyContent = (state: LegacyContent) => JSON.stringify({
    findings: state.findings, reviewed: state.reviewed, fileCheckpoints: state.fileCheckpoints, finishedAt: state.finishedAt
  });
  // Saving an open round used to retain the same checkpoint record as a
  // completed round. When the saved content matches, preserve that clean state.
  if (legacyContent(legacy) === legacyContent(legacy.checkpoint)) checkpoint.fileRounds = structuredClone(content.fileRounds);
  const { fileCheckpoints, ...rest } = legacy;
  return { ...rest, ...content, version: 5, checkpoint, history };
}
