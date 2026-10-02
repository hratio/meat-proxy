import type { DiffFile, DiffLineCounts, FileHistoryEntry } from './types';

export type ReviewView = 'latest' | 'head';
export type FileViewSelection = {
  kind: ReviewView | 'history';
  round?: string;
  finding?: string;
};

// UI state outlives a windowed section. Expanded Pierre contexts remain mounted
// because their expansion ranges also live inside the viewer instance.
export type FileSectionState = {
  viewKind: FileViewSelection['kind'];
  viewRound?: string;
  viewFinding?: string;
  override?: DiffFile;
  entries: FileHistoryEntry[];
  loadedHistoryKey: string;
  collapsed: boolean;
  historyExpanded?: boolean;
  expandedContext?: { file: DiffFile; lineCounts: DiffLineCounts };
  measured?: { key: string; height: number };
};
