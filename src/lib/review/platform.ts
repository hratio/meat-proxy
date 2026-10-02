import type { Catalog, Config } from '../config';
import type { CommitPage, DiffContents, DiffFile, Repository, Review, Selection, SelectionInput } from '../types';
import type { ReviewVersions } from './versions';

/** I/O used by the review engine. Review policy and state transitions live in the engine. */
export type ReviewPlatform = {
  appName: string;
  configPath: string;
  root: string;
  dataDirectory: (repository: Repository) => string;
  connection: (dataDir: string) => object;
  join: (...parts: string[]) => string;
  digest: (text: string) => string;
  fs: {
    readFile: (path: string, encoding: 'utf8') => Promise<string>;
    mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
    readdir: (path: string) => Promise<string[]>;
    unlink: (path: string) => Promise<void>;
    rename: (from: string, to: string) => Promise<void>;
    cp: (from: string, to: string, options: { recursive: true }) => Promise<void>;
    atomicWrite: (path: string, value: string | Uint8Array) => Promise<void>;
  };
  loadSettings: () => Promise<{ config: Config; catalog: Catalog }>;
  saveSettings: (value: Config) => Promise<Config>;
  saveCatalog: (value: unknown) => Promise<Catalog>;
  repository: (path: string, config: Config) => Promise<Repository>;
  currentHead: (worktree: string, config: Config) => Promise<string>;
  pinSelection: (input: SelectionInput, repo: Repository, config: Config) => Promise<Selection>;
  readDiff: (selection: Selection, config: Config) => Promise<{ files: DiffFile[]; warning?: string }>;
  readCommitContents: (selection: Selection, file: DiffFile, config: Config) => Promise<DiffContents>;
  commitPage: (worktree: string, branch: string, before: string | undefined, offset: number, repo: Repository, config: Config) => Promise<CommitPage>;
  createVersions: (directory: string, review: Review, config: Config) => ReviewVersions;
};

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
