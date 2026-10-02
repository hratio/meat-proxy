import type { Comparison, DiffContents } from '../types';

export function fileContents(path: string, comparison: Comparison, before: string, after: string, oldPath = path): DiffContents {
  const count = (text: string) => text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0;
  return {
    oldFile: { name: oldPath, contents: before, cacheKey: `${comparison.base}:${oldPath}` },
    newFile: { name: path, contents: after, cacheKey: `${comparison.head}:${path}` },
    lineCounts: { deletions: count(before), additions: count(after) }
  };
}
