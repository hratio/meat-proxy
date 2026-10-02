import { getAllContexts, mount, unmount } from 'svelte';
import FileTreeIndicators from '$lib/components/FileTreeIndicators.svelte';

type Indicators = { finding: boolean; comment: boolean; reviewed: boolean; gitStatus?: string };

// Trees has no component slot or row mount hook. Attach Svelte components to its
// trailing decoration containers, and dispose them when virtualized rows leave.
export function attachFileTreeIndicators(root: ShadowRoot, read: (path: string) => Indicators, context: ReturnType<typeof getAllContexts>) {
  let disposed = false;
  const entries = new Map<HTMLElement, { target: HTMLElement; props: Indicators; component: ReturnType<typeof mount> }>();
  const remove = (row: HTMLElement) => {
    const entry = entries.get(row)!;
    entries.delete(row);
    void unmount(entry.component);
    entry.target.remove();
    delete row.dataset.fileGitStatus;
  };
  const update = () => {
    if (disposed) return;
    for (const [row, entry] of entries) {
      if (!root.contains(row) || row.hasAttribute('data-item-parked') || !row.contains(entry.target)) remove(row);
    }
    for (const row of root.querySelectorAll<HTMLElement>('[data-item-type="file"][data-item-path]:not([data-item-parked])')) {
      const state = read(row.dataset.itemPath!);
      if (state.gitStatus) row.dataset.fileGitStatus = state.gitStatus[0];
      else delete row.dataset.fileGitStatus;
      const existing = entries.get(row);
      if (existing) { Object.assign(existing.props, state); continue; }
      const decoration = row.querySelector<HTMLElement>('[data-item-section="decoration"] > span');
      if (!decoration) continue;
      const target = document.createElement('span');
      target.dataset.treeIndicatorsMount = '';
      decoration.appendChild(target);
      const props = $state(state);
      const component = mount(FileTreeIndicators, { target, props, context });
      entries.set(row, { target, props, component });
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-item-path', 'data-item-parked'] });
  // Mount outside the tree's render effect, as with diff annotation components.
  queueMicrotask(update);
  return {
    update,
    destroy() {
      disposed = true;
      observer.disconnect();
      for (const row of entries.keys()) remove(row);
    }
  };
}
