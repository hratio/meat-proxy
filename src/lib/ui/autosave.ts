export type AutosaveStatus = 'idle' | 'saving' | 'error';

// Each field has its own debounce. Writes are serialized, and edits made during
// a request stay queued until that request finishes.
export function createAutosave<T extends Record<string, unknown>>(
  save: (changes: Partial<T>) => Promise<void>,
  onstatus: (status: AutosaveStatus, error?: string) => void,
) {
  type Entry = { value: unknown; ready: boolean; timer?: ReturnType<typeof setTimeout> };
  const pending = new Map<string, Entry>();
  let active: Promise<void> | undefined;
  let failure: string | undefined;

  function report() { onstatus(failure ? 'error' : active || pending.size ? 'saving' : 'idle', failure); }

  function drain(): Promise<void> {
    if (active) return active;
    const entries = [...pending].filter(([, entry]) => entry.ready);
    if (failure || !entries.length) return Promise.resolve();
    active = Promise.resolve().then(() => save(Object.fromEntries(entries.map(([key, entry]) => [key, entry.value])) as Partial<T>))
      .then(() => {
        for (const [key, entry] of entries) if (pending.get(key) === entry) pending.delete(key);
      }, cause => { failure = cause instanceof Error ? cause.message : String(cause); })
      .finally(() => { active = undefined; report(); if (!failure) void drain(); });
    report();
    return active;
  }

  function update(changes: Partial<T>, delay = 300) {
    failure = undefined;
    for (const [key, value] of Object.entries(changes)) {
      clearTimeout(pending.get(key)?.timer);
      const entry: Entry = { value, ready: delay === 0 };
      if (delay) entry.timer = setTimeout(() => { entry.ready = true; void drain(); }, delay);
      pending.set(key, entry);
    }
    report();
    void drain();
  }

  function cancel(key: keyof T & string) {
    clearTimeout(pending.get(key)?.timer);
    pending.delete(key);
    if (!pending.size) failure = undefined;
    report();
  }

  async function flush() {
    failure = undefined;
    do {
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.ready = true; }
      await drain();
      if (failure) return false;
    } while (pending.size || active);
    report();
    return true;
  }

  return { update, cancel, flush };
}
