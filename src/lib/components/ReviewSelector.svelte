<script lang="ts">
  import { reviewFetch as fetch } from '$review-client';
  import { untrack } from 'svelte';
  import { mergeProps } from 'bits-ui';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { ButtonGroup } from '$lib/components/ui/button-group';
  import Hint from './Hint.svelte';
  import AnimatedNumber from './AnimatedNumber.svelte';
  import ProgressFill from './ProgressFill.svelte';
  import SingleSelect, { type SelectOption } from './SingleSelect.svelte';
  import { GitBranch, Crosshair, ArrowDown, Radio, LockKeyhole, RotateCcw, AlertTriangle } from '@lucide/svelte';
  import type { CommitPage, Repository, Selection, SelectionInput } from '$lib/types';

  let { repo, selection, baselineOid, additions, deletions, covered, reducedMotion = false, updating = false, updateDisabled = false, onupdate, onselect, onrefresh }: {
    repo: Repository; selection: Selection;
    baselineOid?: string;
    additions: number; deletions: number; covered: number; reducedMotion?: boolean;
    updating?: boolean; updateDisabled?: boolean; onupdate: () => void;
    onselect: (input: SelectionInput, reset?: boolean) => void;
    onrefresh: (path?: string) => Promise<Repository>;
  } = $props();
  let delta = $derived(additions + deletions);
  let coveredLines = $derived(Math.max(0, Math.min(covered, delta)));
  let deltaPercent = $derived(delta ? coveredLines / delta * 100 : 0);
  const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const emptyPage = (): CommitPage => ({ commits: [], hasMore: false });
  let open = $state(false);
  let context = $state<Repository>(untrack(() => repo));
  let worktree = $state(untrack(() => selection.worktree));
  let mode = $state<SelectionInput['mode']>(untrack(() => selection.mode));
  let sourceBranch = $state('HEAD'), targetBranch = $state('HEAD');
  let sourceRef = $state(''), targetRef = $state('');
  let sourcePage = $state<CommitPage>(emptyPage()), targetPage = $state<CommitPage>(emptyPage());
  let loading = $state(false), error = $state('');
  let requestNumber = 0;
  let branches = $derived([...new Set([...context.branches, ...(currentBranch() === 'HEAD' ? ['HEAD'] : [])])]);
  let activeBranch = $derived(context.worktrees.find(w => w.path === selection.worktree)?.branch || 'detached HEAD');
  let restart = $derived(worktree === selection.worktree && mode === selection.mode &&
    (mode === 'live' || sourceRef === selection.sourceOid && targetRef === selection.targetOid));

  function currentBranch() {
    const branch = context.worktrees.find(w => w.path === worktree)?.branch;
    return branch && context.branches.includes(branch) ? branch : 'HEAD';
  }

  function summaryRef(ref: string, branch?: string, oid?: string) {
    if (ref === emptyTree) return 'Empty tree';
    const label = branch || (/^[a-f0-9]{40,64}$/.test(ref) ? '' : ref);
    return [label, oid?.slice(0, 7)].filter(Boolean).join(' · ');
  }

  function close() { open = false; requestNumber++; loading = false; }

  async function commits(branch: string, before?: string, offset = 0): Promise<CommitPage> {
    const query = new URLSearchParams({ worktree, branch, offset: String(offset) });
    if (before) query.set('before', before);
    const response = await fetch(`/api/commits?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load commits.');
    return result;
  }

  async function loadComparison(keepSource = false, keepTarget = false) {
    const request = ++requestNumber;
    loading = true; error = '';
    try {
      const source = await commits(sourceBranch);
      if (request !== requestNumber) return;
      sourcePage = source;
      if (!keepSource) sourceRef = source.head || '';
      if (!sourceRef) { targetRef = ''; targetPage = emptyPage(); return; }
      const sameBranch = sourceBranch === targetBranch;
      const target = await commits(targetBranch, sameBranch ? sourceRef : undefined);
      if (request !== requestNumber) return;
      targetPage = target;
      if (!keepTarget) targetRef = sameBranch ? target.anchorParent || emptyTree : target.head || '';
    } catch (e) { if (request === requestNumber) error = String(e); }
    finally { if (request === requestNumber) loading = false; }
  }

  async function expand() {
    open = true; loading = true; error = '';
    worktree = selection.worktree; mode = selection.mode;
    const request = ++requestNumber;
    try {
      const result = await onrefresh(worktree);
      if (request !== requestNumber) return;
      context = result;
      if (selection.mode === 'compare') {
        sourceBranch = selection.sourceBranch && selection.sourceBranch !== 'HEAD' ? selection.sourceBranch : context.branches.includes(selection.sourceRef) ? selection.sourceRef : currentBranch();
        targetBranch = selection.targetBranch && selection.targetBranch !== 'HEAD' ? selection.targetBranch : context.branches.includes(selection.targetRef) ? selection.targetRef : currentBranch();
        sourceRef = selection.sourceOid || ''; targetRef = selection.targetOid;
        await loadComparison(true, true);
      }
    } catch (e) { if (request === requestNumber) error = String(e); }
    finally { if (request === requestNumber) loading = false; }
  }

  async function changeWorktree(path: string) {
    const request = ++requestNumber;
    loading = true; error = '';
    try {
      const result = await onrefresh(path);
      if (request !== requestNumber) return;
      context = result; worktree = path;
      sourceBranch = targetBranch = currentBranch();
      if (mode === 'compare') await loadComparison();
    } catch (e) { if (request === requestNumber) error = String(e); }
    finally { if (request === requestNumber) loading = false; }
  }

  function changeMode(next: SelectionInput['mode']) {
    if (next === mode) return;
    mode = next; error = '';
    if (mode === 'compare') { sourceBranch = targetBranch = currentBranch(); void loadComparison(); }
    else { requestNumber++; loading = false; }
  }

  async function older(side: 'source' | 'target') {
    const request = ++requestNumber;
    const page = side === 'source' ? sourcePage : targetPage;
    loading = true; error = '';
    try {
      const next = await commits(side === 'source' ? sourceBranch : targetBranch,
        side === 'target' && sourceBranch === targetBranch ? sourceRef : undefined, page.commits.length);
      if (request !== requestNumber) return;
      const merged = { ...next, commits: [...page.commits, ...next.commits] };
      if (side === 'source') sourcePage = merged; else targetPage = merged;
    } catch (e) { if (request === requestNumber) error = String(e); }
    finally { if (request === requestNumber) loading = false; }
  }

  function commitLabel(commit: CommitPage['commits'][number], page: CommitPage) {
    const ref = commit.oid === page.head ? 'HEAD' : commit.oid === page.parent ? 'HEAD~1' : '';
    return `${ref ? `${ref} · ` : ''}${commit.oid.slice(0, 7)} · ${commit.subject}`;
  }

  function commitOptions(page: CommitPage, selected: string, target = false): SelectOption[] {
    const options: SelectOption[] = page.commits.map(commit => ({
      value: commit.oid,
      label: `${commitLabel(commit, page)}${target && commit.oid === sourceRef ? ' · Same as source' : ''}`,
      disabled: target && commit.oid === sourceRef
    }));
    if (selected && !options.some(option => option.value === selected)) {
      options.unshift({ value: selected, label: selected === emptyTree ? 'Empty tree · Before the first commit' : `${selected.slice(0, 7)} · Selected commit` });
    }
    return options;
  }

  function submit() {
    const input: SelectionInput = mode === 'live' ? { mode, worktree } : { mode, worktree, sourceRef, targetRef, sourceBranch, targetBranch };
    onselect(input, restart); close();
  }
</script>

<div class="review-selector relative shrink-0" data-cursor="native">
  <Popover.Root bind:open onOpenChange={value => { if (value) void expand(); else close(); }}>
    <div class="review-comparison-summary rounded-sm border border-input border-l-0 shadow-md">
      <Popover.Trigger>
        {#snippet child({ props: popoverProps })}
          <Button {...popoverProps} variant="summary" size="summary" class="selector-summary border-0 rounded-b-none border-b border-b-muted-foreground/20 bg-transparent border-l-2 border-l-muted-foreground shadow-none focus-visible:ring-inset bg-popover">
            <span class="flex min-w-0 items-center gap-2 text-xs font-normal text-muted-foreground">
              <span class={`size-1.5 shrink-0 rounded-full ${selection.mode === 'live' ? 'bg-[var(--green)]' : 'bg-primary'}`}></span>
              {selection.mode === 'live' ? 'Realtime review' : 'Commit comparison'}
            </span>
            <span class="truncate text-[calc(var(--ui-font-size)+5px)] leading-snug font-semibold">{selection.worktree.split('/').filter(Boolean).at(-1)}</span>
            <span class="flex min-w-0 items-center gap-2 text-xs font-normal text-muted-foreground">
              {#if selection.mode === 'live'}
                <GitBranch class="size-3.5" /><span class="truncate">{activeBranch}</span>
              {:else}
                <span class="truncate">{summaryRef(selection.sourceRef, selection.sourceBranch, selection.sourceOid)} → {summaryRef(selection.targetRef, selection.targetBranch, selection.targetOid)}</span>
              {/if}
            </span>
          </Button>
        {/snippet}
      </Popover.Trigger>
      <div class="px-3.5 pb-3 border-l-2 border-l-muted-foreground/65 rounded-bl-sm bg-popover/60">
        <div class="review-delta">
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 pt-3 text-xs font-normal text-muted-foreground" title={selection.mode === 'live' ? 'Working tree against HEAD' : 'Changes between the selected commits'}>
            <span>Changed lines</span>
            <span class="tabular-nums"><span class="font-semibold text-foreground">{delta.toLocaleString('en-US')}</span> (<span class="text-(--green)">+{additions.toLocaleString('en-US')}</span> / <span class="text-(--red)">−{deletions.toLocaleString('en-US')}</span>)</span>
          </div>
          <div class="mb-2 flex items-baseline justify-between gap-2 font-sans text-[12px]/[1.25] text-muted-foreground"><span>Changes covered</span><strong class="font-semibold whitespace-nowrap text-foreground tabular-nums"><AnimatedNumber value={coveredLines} {reducedMotion} /><span class="font-normal text-muted-foreground"> / <AnimatedNumber value={delta} {reducedMotion} /></span></strong></div>
          <div class="progress-track h-1.5 rounded-xs bg-muted-foreground/16 shadow-[inset_0_1px_2px_#0005]" role="progressbar" aria-label="Changes covered" aria-valuemin={0} aria-valuemax={Math.max(1, delta)} aria-valuenow={coveredLines} aria-valuetext={delta ? `${coveredLines} of ${delta} changed lines covered` : 'No changed lines to review'}>
            <ProgressFill percent={deltaPercent} {reducedMotion} class={delta > 0 && coveredLines === delta ? 'bg-(--green)' : 'bg-linear-to-r from-primary/65 to-primary'} />
          </div>
        </div>
      </div>
    </div>
    <Popover.Content variant="panel" align="start" sideOffset={8} class="max-h-(--bits-popover-content-available-height) w-[min(430px,calc(100vw-32px))] gap-4 overflow-y-auto p-5" aria-label="Review comparison">
      <SingleSelect label="Worktree" value={worktree} disabled={loading} onchange={changeWorktree}
        options={context.worktrees.map(tree => ({ value: tree.path, label: `${tree.path.split('/').at(-1)} · ${tree.branch || 'detached HEAD'}` }))} />
      <div class="grid grid-cols-2 gap-2" role="group" aria-label="Review mode">
        <Button variant="outline" size="card" selected={mode === 'live'} aria-pressed={mode === 'live'} onclick={() => changeMode('live')}>
          <Radio /><span>Realtime review</span><span class="basis-full text-left text-xs font-normal text-muted-foreground">Working tree against HEAD</span>
        </Button>
        <Button variant="outline" size="card" selected={mode === 'compare'} aria-pressed={mode === 'compare'} onclick={() => changeMode('compare')}>
          <LockKeyhole /><span>Commit comparison</span><span class="basis-full text-left text-xs font-normal text-muted-foreground">Two fixed commits</span>
        </Button>
      </div>
      {#if mode === 'compare'}
        <fieldset class="grid min-w-0 gap-3 rounded-md border border-border p-3">
          <legend class="px-1 text-xs text-muted-foreground">Source</legend>
          <SingleSelect label="Source branch" value={sourceBranch} disabled={loading}
            options={branches.map(branch => ({ value: branch, label: branch === 'HEAD' ? 'Current checkout (HEAD)' : branch }))}
            onchange={value => { sourceBranch = value; void loadComparison(); }} />
          <SingleSelect label="Source commit" value={sourceRef} disabled={loading} placeholder="No commits"
            options={commitOptions(sourcePage, sourceRef)} onchange={value => { sourceRef = value; void loadComparison(true); }} />
          {#if sourcePage.hasMore}<Button variant="ghost" size="sm" class="justify-self-start" disabled={loading} onclick={() => older('source')}>Older commits…</Button>{/if}
        </fieldset>
        <div class="flex items-center gap-2 text-xs text-muted-foreground"><ArrowDown class="size-3.5" />Compare against</div>
        <fieldset class="grid min-w-0 gap-3 rounded-md border border-border p-3">
          <legend class="px-1 text-xs text-muted-foreground">Target</legend>
          <SingleSelect label="Target branch" value={targetBranch} disabled={loading}
            options={branches.map(branch => ({ value: branch, label: branch === 'HEAD' ? 'Current checkout (HEAD)' : branch }))}
            onchange={value => { targetBranch = value; void loadComparison(true); }} />
          <SingleSelect label="Target commit" bind:value={targetRef} disabled={loading} placeholder="No commits" options={commitOptions(targetPage, targetRef, true)} />
          {#if targetPage.hasMore}<Button variant="ghost" size="sm" class="justify-self-start" disabled={loading} onclick={() => older('target')}>Older commits…</Button>{/if}
        </fieldset>
        <p class="flex items-start gap-2 text-xs text-muted-foreground"><LockKeyhole class="mt-0.5 size-3.5 shrink-0" />{sourceBranch === targetBranch ? 'Target shows earlier ancestors of the source. Both commits are pinned.' : 'Both commits are pinned when you start the comparison.'}</p>
      {/if}
      {#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
      <Button class="w-full" disabled={loading || !!error || mode === 'compare' && (!sourceRef || !targetRef || sourceRef === targetRef)} onclick={submit}>
        {#if restart}<RotateCcw />{:else}<Crosshair />{/if}
        {loading ? 'Loading…' : restart ? mode === 'live' ? 'Restart live review' : 'Restart comparison' : mode === 'live' ? 'Enter live review' : 'Lock comparison'}
      </Button>
    </Popover.Content>
  </Popover.Root>
  {#if selection.mode === 'live' && baselineOid && baselineOid !== selection.targetOid}
    <section class="mt-2 rounded border border-primary/35 bg-card px-3.5 py-3 text-xs text-muted-foreground" aria-label="Review baseline changed" role="status">
      <p class="flex items-center gap-2 font-semibold text-primary"><AlertTriangle class="size-3.5 shrink-0" />Review may be stale</p>
      <p class="mt-2">HEAD changed from <span class="font-mono">{baselineOid.slice(0, 7)}</span> to <span class="font-mono">{selection.targetOid.slice(0, 7)}</span>.</p>
      <ButtonGroup class="mt-2 w-full" aria-label="Reconcile review">
        <Button variant="outline" size="sm" class="flex-1" disabled={updating || updateDisabled} onclick={onupdate}><RotateCcw />{updating ? 'Reconciling…' : 'Reconcile'}</Button>
        <Popover.Root>
          <Popover.Trigger openOnHover openDelay={250}>
            {#snippet child({ props })}<Button {...props} variant="outline" size="sm">Huh?</Button>{/snippet}
          </Popover.Trigger>
          <Popover.Content variant="panel" side="bottom" align="end" class="w-[min(340px,calc(100vw-32px))] p-4" aria-label="What does reconcile do?">
            <p class="font-semibold">What changed?</p>
            <p class="text-sm text-muted-foreground">HEAD is now a different commit. Your file count still includes earlier review work, while changes covered measures changes against the current HEAD.</p>
            <p class="font-semibold">Reconcile keeps what still matters.</p>
            <p class="text-sm text-muted-foreground">It refreshes the file list and carries unresolved findings, comments, and replies forward. Already-reviewed changes stay covered where we can verify them.</p>
            <p class="text-sm text-muted-foreground">Findings on committed files stay in the findings list with their original code context. The previous review is archived.</p>
          </Popover.Content>
        </Popover.Root>
      </ButtonGroup>
    </section>
  {/if}
</div>
