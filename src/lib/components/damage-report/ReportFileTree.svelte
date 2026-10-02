<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { FileTree } from '@pierre/trees';
  import { reportSortOptions, type ReportFile, type ReportSort } from '$lib/damage-report';
  import treeStyles from '$lib/styles/file-tree.css?inline';

  let { files, selectedPath, sort, onselect }: {
    files: ReportFile[]; selectedPath: string; sort: ReportSort; onselect: (path: string) => void;
  } = $props();
  let container: HTMLDivElement;
  let tree: FileTree;
  let mounted = $state(false);
  let syncing = false;
  let previousPaths = '';
  let previousSort = '';
  let previousCounts = '';
  let previousSelected = '';
  const collapsed = new Set<string>();
  const paths = $derived(files.map(file => file.path));
  const countKey = $derived(JSON.stringify(files.map(file => file[sort])));
  const counts = $derived.by(() => {
    const result = new Map<string, number>();
    for (const file of files) {
      result.set(file.path, file[sort]);
      const segments = file.path.split('/');
      for (let depth = 1; depth < segments.length; depth++) {
        const directory = segments.slice(0, depth).join('/');
        result.set(directory, (result.get(directory) ?? 0) + file[sort]);
      }
    }
    return result;
  });
  const countLabel = $derived(reportSortOptions.find(option => option.value === sort)!.label);
  const count = (path: string) => counts.get(path.replace(/\/$/, '')) ?? 0;
  function directories(filePaths: string[]) {
    return new Set(filePaths.flatMap(path => {
      const segments = path.split('/');
      return segments.slice(1).map((_, index) => segments.slice(0, index + 1).join('/'));
    }));
  }

  onMount(() => {
    tree = new FileTree({
      paths, initialExpansion: 'open', flattenEmptyDirectories: false, search: false, itemHeight: 30,
      unsafeCSS: `${treeStyles}\n[data-item-section="decoration"]:not(:has([data-file-indicator])) { display: flex; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--trees-fg-muted); }`,
      sort: (left, right) => Number(right.isDirectory) - Number(left.isDirectory) || count(right.path) - count(left.path) || left.basename.localeCompare(right.basename),
      renderRowDecoration: ({ item }) => ({ text: String(count(item.path)), title: `${countLabel}: ${count(item.path)}` }),
      onSelectionChange: selected => { if (!syncing && selected[0] && paths.includes(selected[0])) onselect(selected[0]); }
    });
    tree.render({ containerWrapper: container });
    const host = tree.getFileTreeContainer();
    if (host) {
      const styles = {
        '--trees-bg-override': 'transparent',
        '--trees-level-gap-override': '8px',
        '--trees-padding-inline-override': '0px',
        '--trees-fg-override': 'var(--muted-foreground)',
        '--trees-fg-muted-override': 'var(--muted-foreground)',
        '--trees-accent-override': 'var(--primary)',
        '--trees-bg-muted-override': 'var(--tree-hover)',
        '--trees-selected-bg-override': 'var(--tree-selection)',
        '--trees-selected-fg-override': 'var(--foreground)',
        '--trees-selected-focused-border-color-override': 'var(--tree-focus)',
        '--trees-border-color-override': 'var(--border)',
        '--trees-scrollbar-thumb-override': 'var(--tree-scrollbar)',
        '--trees-font-family-override': 'var(--ui)',
        '--trees-font-size-override': 'var(--ui-font-size)'
      };
      for (const [key, value] of Object.entries(styles)) host.style.setProperty(key, value);
      host.shadowRoot?.querySelector('[role="tree"]')?.setAttribute('aria-label', 'Finding files');
    }
    previousPaths = JSON.stringify(paths);
    previousSort = sort;
    previousCounts = countKey;
    mounted = true;
    return () => { tree.cleanUp(); container.replaceChildren(); };
  });

  $effect(() => {
    if (!mounted) return;
    const nextPaths = paths, nextSort = sort, nextCounts = countKey, selected = selectedPath;
    void counts;
    untrack(() => {
      syncing = true;
      try {
        const serialized = JSON.stringify(nextPaths);
        if (serialized !== previousPaths || nextSort !== previousSort || nextCounts !== previousCounts) {
          for (const path of directories(JSON.parse(previousPaths))) {
            const item = tree.getItem(path);
            if (item && 'isExpanded' in item) {
              if (item.isExpanded()) collapsed.delete(path); else collapsed.add(path);
            }
          }
          tree.resetPaths(nextPaths);
          for (const path of collapsed) {
            const item = tree.getItem(path);
            if (item && 'collapse' in item) item.collapse();
          }
          previousPaths = serialized;
          previousSort = nextSort;
          previousCounts = nextCounts;
        }
        for (const path of tree.getSelectedPaths()) if (path !== selected) tree.getItem(path)?.deselect();
        const item = tree.getItem(selected);
        if (item && !item.isSelected()) item.select();
        if (selected !== previousSelected) {
          for (const path of directories([selected])) {
            const folder = tree.getItem(path);
            if (folder && 'expand' in folder) folder.expand();
          }
          tree.scrollToPath(selected, { focus: false, offset: 'nearest' });
          previousSelected = selected;
        }
        tree.render({});
      } finally { syncing = false; }
    });
  });
</script>

<nav class="h-full min-h-0 overflow-hidden bg-background/20 p-2" aria-label="Finding files" data-report-file-list data-cursor="native">
  <div class="size-full [&_file-tree-container]:h-full" bind:this={container}></div>
</nav>
