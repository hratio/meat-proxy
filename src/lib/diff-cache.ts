import { parsePatchFiles, type FileDiffMetadata } from '@pierre/diffs';
import { diffRows, type DiffRow } from './location';
import type { DiffFile } from './types';
import { DiffRowIndex } from './diff-row-index';

type Entry = {
  patch: string;
  parsed?: FileDiffMetadata;
  rows?: DiffRow[];
  index?: DiffRowIndex;
  counts?: string;
  hydrated?: boolean;
  bytes: number;
};

// One cache belongs to one review page. Offscreen components can release their
// DOM while a bounded set of recently visited comparisons keeps its preparation.
export class DiffCache {
  private entries = new Map<string, Entry>();
  private bytes = 0;

  constructor(private maxEntries = 64, private maxBytes = 16 * 1024 * 1024) {}

  clear() { this.entries.clear(); this.bytes = 0; }

  private entry(file: DiffFile) {
    const key = JSON.stringify([file.path, file.revision, file.comparison?.base, file.comparison?.head]);
    let entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      if (entry.patch !== file.patch) { this.bytes -= entry.bytes; entry = undefined; }
    }
    if (!entry) { entry = { patch: file.patch, bytes: file.patch.length * 2 }; this.bytes += entry.bytes; }
    this.entries.set(key, entry);
    return entry;
  }

  private trim(entry: Entry) {
    // Include strings and a conservative allowance for line/index objects. This
    // is an allocation budget, not an exact measurement of the JS heap.
    const lines = entry.parsed ? [...entry.parsed.additionLines, ...entry.parsed.deletionLines] : [];
    const bytes = entry.patch.length * 2 + lines.reduce((sum, line) => sum + line.length * 2 + 64, 0) + (entry.rows?.length || 0) * (entry.index ? 256 : 96);
    this.bytes += bytes - entry.bytes;
    entry.bytes = bytes;
    entry.hydrated = entry.parsed?.isPartial === false;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const key = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(key)!.bytes;
      this.entries.delete(key);
    }
  }

  parsed(file: DiffFile, cacheKey: string) {
    const entry = this.entry(file);
    if (!entry.parsed) {
      entry.parsed = parsePatchFiles(file.patch).flatMap(patch => patch.files)[0];
      if (entry.parsed) entry.parsed.cacheKey = cacheKey;
      this.trim(entry);
    } else if (!entry.hydrated && !entry.parsed.isPartial) this.trim(entry);
    // Pierre hydrates this object in place and assigns a full-content cache key.
    // Returning that same object avoids replacing it with a partial patch again.
    return entry.parsed;
  }

  index(file: DiffFile) {
    const rows = this.rows(file);
    const entry = this.entry(file);
    entry.rows = rows;
    entry.counts = JSON.stringify(file.lineCounts);
    if (!entry.index) { entry.index = new DiffRowIndex(rows); this.trim(entry); }
    return entry.index;
  }

  rows(file: DiffFile) {
    const entry = this.entry(file);
    const counts = JSON.stringify(file.lineCounts);
    if (!entry.rows || entry.counts !== counts) {
      entry.rows = diffRows(file.patch, file.lineCounts);
      entry.counts = counts;
      entry.index = undefined;
      this.trim(entry);
    } else if (!entry.hydrated && entry.parsed?.isPartial === false) this.trim(entry);
    return entry.rows;
  }
}
