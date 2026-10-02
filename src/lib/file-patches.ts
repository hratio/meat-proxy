import type { DiffFile, FileHistoryEntry } from './types';

export type FilePatch = { file: DiffFile; entries: FileHistoryEntry[] };
type Job = { key: string; reviewId: string; path: string; priority: number; controller: AbortController; run: () => void };

// The page owns this cache and clears it on review changes. Only mounted/nearby
// slots ask for patches; offscreen jobs are canceled before starting a request.
export class FilePatches {
  private cache = new Map<string, { value: FilePatch; bytes: number }>();
  private bytes = 0;
  private pending: Job[] = [];
  private active = new Set<Job>();

  constructor(private maxEntries = 64, private maxBytes = 16 * 1024 * 1024, private request: typeof fetch = fetch) {}

  clear() {
    for (const job of [...this.pending, ...this.active]) job.controller.abort();
    this.pending = []; this.cache.clear(); this.bytes = 0;
  }

  load(file: DiffFile, reviewId: string, signal: AbortSignal, priority = 0): Promise<FilePatch> {
    const key = file.patchKey;
    if (!key) return Promise.reject(new Error('This file has no patch identity.'));
    if (signal.aborted) return Promise.reject(new DOMException('Canceled', 'AbortError'));
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return Promise.resolve(cached.value); }
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      const job: Job = { key, reviewId, path: file.path, priority, controller, run: async () => {
        try {
          const query = new URLSearchParams({ reviewId, path: file.path, key });
          const response = await this.request(`/api/file-patch?${query}`, { signal: controller.signal });
          const value = await response.json();
          if (!response.ok) throw new Error(value.error || 'Could not load this diff.');
          if (controller.signal.aborted) throw new DOMException('Canceled', 'AbortError');
          if (value.file.patchKey !== key || value.file.path !== file.path || value.file.revision !== file.revision) throw new Error('The file changed while its diff was loading.');
          const bytes = value.file.patch.length * 2;
          if (bytes <= this.maxBytes) {
            const previous = this.cache.get(key);
            if (previous) this.bytes -= previous.bytes;
            this.cache.delete(key); this.cache.set(key, { value, bytes }); this.bytes += bytes;
            while (this.cache.size > this.maxEntries || this.bytes > this.maxBytes) {
              const oldest = this.cache.keys().next().value!;
              this.bytes -= this.cache.get(oldest)!.bytes; this.cache.delete(oldest);
            }
          }
          resolve(value);
        } catch (error) { reject(error); }
        finally { signal.removeEventListener('abort', cancel); this.active.delete(job); this.drain(); }
      } };
      controller.signal.addEventListener('abort', () => {
        this.pending = this.pending.filter(candidate => candidate !== job);
        signal.removeEventListener('abort', cancel);
        reject(new DOMException('Canceled', 'AbortError'));
      }, { once: true });
      signal.addEventListener('abort', cancel, { once: true });
      this.pending.push(job); this.drain();
    });
  }

  private drain() {
    this.pending.sort((a, b) => a.priority - b.priority);
    while (this.active.size < 2 && this.pending.length) {
      const job = this.pending.shift()!;
      if (job.controller.signal.aborted) continue;
      this.active.add(job); job.run();
    }
  }
}
