import type { Catalog, Config } from '../config';
import type { Snapshot, SnapshotMessage } from '../types';

export type ReviewEvents = {
  snapshot: (value: Snapshot) => void;
  update: (value: SnapshotMessage) => void;
  settings: (value: { config: Config; catalog: Catalog }) => void;
  fault: (message: string) => void;
  disconnected: () => void;
  healthy: () => void;
};
