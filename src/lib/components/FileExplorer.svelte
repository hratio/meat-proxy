<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import { getAllContexts, untrack, type Snippet } from 'svelte';
  import { FileTree } from '@pierre/trees';
  import { Search, X, Settings, Regex, TriangleAlert } from '@lucide/svelte';
  import type { DiffFile, Finding } from '$lib/types';
  import { Button } from '$lib/components/ui/button';
  import * as InputGroup from '$lib/components/ui/input-group';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import type { Config } from '$lib/config';
  import treeStyles from '$lib/styles/file-tree.css?inline';
  import { attachFileTreeIndicators } from '$lib/ui/file-tree-indicators.svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import Hint from './Hint.svelte';
  import FileFilters from './FileFilters.svelte';
  import type { FileFilters as Filters } from '$lib/file-list';
  import type { FileFilterPreset } from '$lib/file-filter-presets';
  import type { FileSearch } from '$lib/ui/file-search.svelte';
  let { search, density, showIcons, showFindings, showComments, showGitStatus, showReviewed, findings, ondisplaychange, files, allFiles, filters, presets, presetError, onpresetschange, onfilter, selected, reviewed, visible, onselect, resizeHandle }: { search: FileSearch; density: 'normal' | 'dense'; showIcons: boolean; showFindings: boolean; showComments: boolean; showGitStatus: boolean; showReviewed: boolean; findings: Finding[]; ondisplaychange: (display: Partial<Config['display']>) => void; files: DiffFile[]; allFiles: DiffFile[]; filters: Filters; presets: FileFilterPreset[]; presetError?: string; onpresetschange: (presets: FileFilterPreset[]) => Promise<void>; onfilter: (filters: Filters) => void; selected: string; reviewed: Record<string, string>; visible: boolean; onselect: (path: string) => void; resizeHandle?: Snippet } = $props();
  const treeId = $props.id();
  const contexts = getAllContexts();
  let indicators: ReturnType<typeof attachFileTreeIndicators> | undefined;
  let container: HTMLDivElement;
  let tree: FileTree;
  let mounted = $state(false);
  let previousPaths = '';
  let syncing = false;
  let query = $derived(search.query);
  let regex = $derived(search.regex);
  let regexTooltipOpen = $state(false);
  let searchTreeActive = false;
  let filePaths = $derived(files.map(file => file.path));
  let searchError = $derived(search.error);
  let resultCount = $derived(files.length);
  let noMatches = $derived(search.active && !searchError && !search.pending && resultCount === 0);
  let contentHeight = $state(0);
  let itemHeight = $state(0);
  let revisions = $derived(new Map(files.map(file => [file.path, file.revision])));
  let gitStatuses = $derived(new Map(files.map(file => [file.path, file.status])));
  let unresolved = $derived.by(() => {
    const result = new Map<string, { findings: boolean; comments: boolean }>();
    for (const finding of findings) {
      if (finding.status !== 'open') continue;
      const indicators = result.get(finding.path) ?? { findings: false, comments: false };
      indicators[finding.code ? 'findings' : 'comments'] = true;
      result.set(finding.path, indicators);
    }
    return result;
  });
  const collapsed = new Set<string>();
  const rememberCollapsed = () => {
    const folders = new Set((JSON.parse(previousPaths || '[]') as string[]).flatMap(path => {
      const segments = path.split('/');
      return segments.slice(1).map((_, index) => segments.slice(0, index + 1).join('/'));
    }));
    for (const path of folders) {
      const item = tree.getItem(path);
      if (item && 'isExpanded' in item) {
        if (item.isExpanded()) collapsed.delete(path);
        else collapsed.add(path);
      }
    }
  };
  const restoreCollapsed = () => {
    for (const path of collapsed) {
      const item = tree.getItem(path);
      if (item && 'collapse' in item) item.collapse();
    }
  };
  $effect(() => {
    const dense = density === 'dense';
    return untrack(() => {
      tree = new FileTree({ paths: files.map(f => f.path), initialExpansion: 'open', search: false, itemHeight: dense ? 24 : 30,
        unsafeCSS: treeStyles,
        onSelectionChange: paths => { if (!syncing && paths[0] && files.some(f => f.path === paths[0])) onselect(paths[0]); },
        renderRowDecoration: ({ item }) => {
          if (!revisions.has(item.path)) return null;
          // Keep a stable trailing container for the Svelte status group.
          return { text: '' };
        }
      });
      if (!search.active) restoreCollapsed();
      previousPaths = JSON.stringify(files.map(file => file.path));
      tree.render({ containerWrapper: container });
      // Only the visible rows own the pointer area. Large trees retain a bounded,
      // virtualized viewport; the empty space below a short tree is the arena.
      itemHeight = tree.getItemHeight();
      const measure = () => { contentHeight = tree.getVisibleCount() * itemHeight; };
      const unsubscribe = tree.subscribe(measure);
      // Trees emits selection changes only when the path changes. Clicking the
      // selected row must also reveal a file that was collapsed in the review.
      const revisit = (event: MouseEvent) => {
        const row = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute('data-item-path'));
        const path = row?.dataset.itemPath;
        if (path === selected && files.some(file => file.path === path)) onselect(path);
      };
      container.addEventListener('click', revisit, true);
      measure();
      const host = tree.getFileTreeContainer();
      if (host) {
        // Trees resolves its palette inside a shadow root. Use its override tokens
        // to inherit the shell palette, independently of the selected diff theme.
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
        if (host.shadowRoot) indicators = attachFileTreeIndicators(host.shadowRoot, path => ({
          finding: showFindings && !!unresolved.get(path)?.findings,
          comment: showComments && !!unresolved.get(path)?.comments,
          reviewed: showReviewed && reviewed[path] === revisions.get(path),
          gitStatus: showGitStatus ? gitStatuses.get(path) : undefined
        }), contexts);
      }
      mounted = true;
      return () => {
        if (!searchTreeActive) { tree.setSearch(null); rememberCollapsed(); }
        searchTreeActive = false;
        mounted = false;
        indicators?.destroy(); indicators = undefined;
        container.removeEventListener('click', revisit, true); unsubscribe(); tree.cleanUp(); container.replaceChildren();
      };
    });
  });
  $effect(() => {
    if (!mounted) return;
    void density;
    tree.getFileTreeContainer()?.style.setProperty('--file-icons-display', showIcons ? 'flex' : 'none');
    syncing = true;
    try {
      const searching = search.active;
      const paths = filePaths;
      const serializedPaths = JSON.stringify(paths);
      if (serializedPaths !== previousPaths || searching !== searchTreeActive) {
        tree.setSearch(null);
        if (!searchTreeActive) rememberCollapsed();
        tree.resetPaths(paths);
        if (!searching) restoreCollapsed();
        previousPaths = serializedPaths;
      }
      searchTreeActive = searching;
      // The shared result already filters both panes. Retain Trees' text
      // highlighting using the applied query while a new search is pending.
      tree.setSearch(search.appliedRegex ? null : search.appliedQuery || null);
      const selectedItem = tree.getItem(selected);
      for (const path of tree.getSelectedPaths()) if (path !== selected) tree.getItem(path)?.deselect();
      if (selectedItem && !tree.getSelectedPaths().includes(selected)) selectedItem.select();
    } finally { syncing = false; }
    // Refresh mounted Svelte indicators when their state or preferences change.
    void reviewed;
    void unresolved;
    void showFindings;
    void showComments;
    void showReviewed;
    void showGitStatus;
    void gitStatuses;
    tree.render({});
    untrack(() => indicators?.update());
  });
</script>

<div class="explorer-content flex h-full flex-col gap-3">
  <div class="file-search-controls pointer-events-auto relative z-35 flex shrink-0 items-stretch gap-2" data-cursor="native">
    <InputGroup.Root class="h-9 flex-1">
      <InputGroup.Input type="text" aria-label="Filter files" placeholder={regex ? 'Filter by regex…' : 'Filter files…'} bind:value={search.query}
        spellcheck={false} autocomplete="off" aria-invalid={!!searchError} aria-describedby={searchError ? `${treeId}-search-status` : undefined}
        onkeydown={event => { if (event.key === 'Escape') search.query = ''; if (event.key === 'Enter') { event.preventDefault(); search.submit(); } }} />
      <InputGroup.Addon><Search /></InputGroup.Addon>
      <InputGroup.Addon align="inline-end" class="gap-1">
        {#if !search.pending && !searchError && resultCount !== allFiles.length}
          <InputGroup.Text aria-label="Matching files" class="px-1 text-xs tabular-nums text-muted-foreground/75">{resultCount}</InputGroup.Text>
        {/if}
        {#if query}
          <Hint text="Clear file search">
            {#snippet children({ props })}<InputGroup.Button {...mergeProps(props, { onclick: () => search.query = '' })} size="icon-xs" aria-label="Clear file search"><X /></InputGroup.Button>{/snippet}
          </Hint>
        {/if}
        <FileFilters files={allFiles} value={filters} {presets} {presetError} {onpresetschange} onchange={onfilter} />
        <Tooltip.Root bind:open={() => !!searchError || regexTooltipOpen, open => regexTooltipOpen = !searchError && open}>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <InputGroup.Button {...mergeProps(props, { onclick: () => search.regex = !regex })} size="icon-xs" aria-label="Use regular expression" aria-pressed={regex} class={regex ? `bg-accent ${searchError ? 'text-destructive' : 'text-primary'}` : ''}>
                {#if searchError}<TriangleAlert data-regex-error />{:else}<Regex />{/if}
              </InputGroup.Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="top" align="end" class="w-80 flex-col items-stretch gap-3 p-3 text-left">
            {#if searchError}
              <div class="space-y-1 border-b border-border pb-2 text-destructive">
                <p class="font-semibold">{search.syntaxError ? 'Invalid regular expression' : 'Could not run expression'}</p>
                <p class="break-words">{searchError}</p>
              </div>
            {/if}
            <div class="space-y-1">
              <p class="font-semibold">Regular expression filter</p>
              <p class="text-muted-foreground">Matches full file paths and is case-sensitive.</p>
            </div>
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt><code>^src/</code></dt><dd class="text-muted-foreground">Files under src</dd>
              <dt><code>\.(ts|svelte)$</code></dt><dd class="text-muted-foreground">TypeScript or Svelte</dd>
            </dl>
            <p class="text-muted-foreground">Enter the pattern without surrounding <code>/…/</code> delimiters. Use <code>\.</code> for a literal dot.</p>
          </Tooltip.Content>
        </Tooltip.Root>
        <span id={`${treeId}-search-status`} role="status" class="sr-only">{searchError}</span>
      </InputGroup.Addon>
    </InputGroup.Root>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props: trigger })}
          <Hint text="File tree settings">
            {#snippet children({ props: hint })}
              <Button {...mergeProps(trigger, hint)} variant="outline" size="icon-lg" aria-label="File tree settings"><Settings /></Button>
            {/snippet}
          </Hint>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-64" data-cursor="native">
        <DropdownMenu.Group>
          <DropdownMenu.GroupHeading>File tree</DropdownMenu.GroupHeading>
          <DropdownMenu.CheckboxItemSwitch checked={showFindings} onCheckedChange={showFileFindings => ondisplaychange({ showFileFindings })} closeOnSelect={false}>Unresolved findings</DropdownMenu.CheckboxItemSwitch>
          <DropdownMenu.CheckboxItemSwitch checked={showComments} onCheckedChange={showFileComments => ondisplaychange({ showFileComments })} closeOnSelect={false}>Unresolved comments</DropdownMenu.CheckboxItemSwitch>
          <DropdownMenu.CheckboxItemSwitch checked={showGitStatus} onCheckedChange={showFileGitStatus => ondisplaychange({ showFileGitStatus })} closeOnSelect={false}>Git status</DropdownMenu.CheckboxItemSwitch>
          <DropdownMenu.CheckboxItemSwitch checked={showReviewed} onCheckedChange={showFileReviewed => ondisplaychange({ showFileReviewed })} closeOnSelect={false}>Review checkmarks</DropdownMenu.CheckboxItemSwitch>
          <DropdownMenu.Separator />
          <DropdownMenu.CheckboxItemSwitch checked={density === 'dense'} onCheckedChange={dense => ondisplaychange({ fileTreeDensity: dense ? 'dense' : 'normal' })} closeOnSelect={false}>Dense rows</DropdownMenu.CheckboxItemSwitch>
          <DropdownMenu.CheckboxItemSwitch checked={showIcons} onCheckedChange={showFileIcons => ondisplaychange({ showFileIcons })} closeOnSelect={false}>Show file icons</DropdownMenu.CheckboxItemSwitch>
          <DropdownMenu.Separator />
          <DropdownMenu.CheckboxItemSwitch checked={visible} onCheckedChange={explorerVisible => ondisplaychange({ explorerVisible })} closeOnSelect={false} aria-controls={treeId}>Show file tree</DropdownMenu.CheckboxItemSwitch>
        </DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
  <div id={treeId} class="file-tree-view pointer-events-auto relative z-10 min-h-0 flex-[0_1_auto]" class:hidden={!visible} inert={!visible} aria-busy={search.pending} data-cursor="native" style:height={`${noMatches ? itemHeight * 2 : contentHeight}px`}>
    <div class={`file-explorer size-full [&_file-tree-container]:h-full ${noMatches ? 'invisible' : ''}`} inert={noMatches} bind:this={container}></div>
    {#if noMatches}<p class="absolute inset-x-0 top-0 px-2 py-4 text-sm text-muted-foreground">No matching files</p>{/if}
    {@render resizeHandle?.()}
  </div>
</div>
