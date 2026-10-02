import type { Config } from './config';
import type { DiffFile, Finding } from './types';
import { prepareFileTreeInput } from '@pierre/trees';

export type FileFilters = { excludedExtensions: string[]; showCompleted: boolean; showDeleted: boolean; presetIds?: string[] };
export type FileSort = Config['display']['fileSort'];
export type FilePriorities = Config['display']['filePriorities'];
export const filePriorityOptions = [
  { value: 'findings', label: 'Most unresolved findings' },
  { value: 'comments', label: 'Most unresolved comments' },
  { value: 'recentComments', label: 'Most recent comment' }
] as const;
export const fileSortOptions = [
  { value: 'default', label: 'Folder order' },
  { value: 'easy', label: 'Fewest changes first' },
  { value: 'hard', label: 'Most changes first' }
] as const;

export function fileExtension(path: string) {
  const name = path.split('/').at(-1) || path;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '(no extension)';
}

export function arrangeFiles(files: DiffFile[], filters: FileFilters, sort: FileSort, options: {
  priorities?: FilePriorities; findings?: Finding[]; presetPaths?: ReadonlySet<string>;
} = {}) {
  const excluded = new Set(filters.excludedExtensions);
  const matching = files.filter(file => !excluded.has(fileExtension(file.path)) && (filters.showDeleted || !file.status.startsWith('D')) && (!options.presetPaths || options.presetPaths.has(file.path)));
  const byPath = new Map(matching.map(file => [file.path, file]));
  // Use the tree's public sorter so folders, casing and numeric names agree
  // exactly with the explorer. Difficulty ties keep this same path order.
  const result = prepareFileTreeInput([...byPath.keys()]).paths.map(path => byPath.get(path)!);
  const priorities = options.priorities;
  const ranked = priorities && Object.values(priorities).some(Boolean);
  const activity = new Map<string, { findings: number; comments: number; recentComments: number }>();
  const timestamp = (value: string) => Date.parse(value) || 0;
  if (ranked) for (const finding of options.findings || []) {
    const counts = activity.get(finding.path) || { findings: 0, comments: 0, recentComments: 0 };
    if (finding.status === 'open') counts[finding.code ? 'findings' : 'comments']++;
    if (!finding.code) {
      counts.recentComments = Math.max(counts.recentComments, timestamp(finding.createdAt));
      for (const reply of finding.replies || []) counts.recentComments = Math.max(counts.recentComments, timestamp(reply.createdAt));
    }
    activity.set(finding.path, counts);
  }
  if (sort !== 'default' || ranked) result.sort((a, b) => {
    for (const { value } of filePriorityOptions) {
      if (!priorities?.[value]) continue;
      const difference = (activity.get(b.path)?.[value] || 0) - (activity.get(a.path)?.[value] || 0);
      if (difference) return difference;
    }
    if (sort === 'default') return 0;
    const difficulty = a.additions + a.deletions - b.additions - b.deletions || a.additions - b.additions;
    return sort === 'easy' ? difficulty : -difficulty;
  });
  return result;
}
