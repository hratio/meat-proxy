import type { DiffFile, Snapshot, SnapshotMessage } from '$lib/types';
import { diffRows, findingForFile } from '$lib/location';
import { DiffRowIndex } from '$lib/diff-row-index';


export function createManifest(digest: (value: string) => string) {
  function patchKey(file: DiffFile, review: Pick<Snapshot['review'], 'id' | 'createdAt'>) {
    // Includes the actual preview: context/size-setting changes can change a
    // patch without changing the captured file version. Resets change createdAt.
    return digest(JSON.stringify([review.id, review.createdAt, file.path, file.revision, file.comparison?.base, file.comparison?.head, file.omitted, file.patch]));
  }

  function manifest(message: SnapshotMessage, review: Snapshot['review'], files: DiffFile[] = [], firstPath?: string): SnapshotMessage {
    const findings = new Map<string, typeof review.findings>();
    for (const finding of review.findings) {
      const list = findings.get(finding.path) || [];
      list.push(finding); findings.set(finding.path, list);
    }
    const metadata = (file: DiffFile): DiffFile => {
      const candidates = findings.get(file.path);
      let locatedFindings: string[] | undefined;
      if (candidates?.length) {
        const index = new DiffRowIndex(diffRows(file.patch, file.lineCounts));
        locatedFindings = candidates.filter(finding => {
          const visible = findingForFile(finding, file);
          return visible && (!visible.ranges?.length || index.has(visible.ranges));
        }).map(finding => finding.id);
      }
      return { ...file, patch: file.path === firstPath ? file.patch : '', patchKey: patchKey(file, review), patchPending: file.path !== firstPath && !!file.patch, ...(locatedFindings ? { locatedFindings } : {}) };
    };
    const changed = 'fromRevision' in message ? new Map(message.files.set.map(file => [file.path, file])) : undefined;
    if (changed && 'fromRevision' in message) {
      const affected = new Set(message.findings.set.map(finding => finding.path));
      for (const file of files) if (affected.has(file.path)) changed.set(file.path, file);
    }
    return 'fromRevision' in message
      ? { ...message, files: { ...message.files, set: [...changed!.values()].map(metadata) } }
      : { ...message, files: message.files.map(metadata) };
  }

  return { patchKey, manifest };
}
