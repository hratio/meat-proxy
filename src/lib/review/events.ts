import type { Catalog, Config } from '../config';
import type { SnapshotMessage } from '../types';

type Events = {
  snapshot: SnapshotMessage; manifest: SnapshotMessage;
  settings: { config: Config; catalog: Catalog };
  fault: string; healthy: undefined; shutdown: undefined;
};

export class ReviewEvents {
  private listeners = new Map<keyof Events, Set<(value: never) => void>>();
  on<K extends keyof Events>(event: K, listener: (value: Events[K]) => void) {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, set = new Set());
    set.add(listener as (value: never) => void); return this;
  }
  off<K extends keyof Events>(event: K, listener: (value: Events[K]) => void) {
    this.listeners.get(event)?.delete(listener as (value: never) => void); return this;
  }
  emit<K extends keyof Events>(event: K, ...values: Events[K] extends undefined ? [] : [Events[K]]) {
    for (const listener of [...this.listeners.get(event) || []]) listener(values[0] as never);
  }
  listenerCount(event: keyof Events) { return this.listeners.get(event)?.size || 0; }
  removeAllListeners() { this.listeners.clear(); }
}
