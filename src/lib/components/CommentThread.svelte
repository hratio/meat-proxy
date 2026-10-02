<script lang="ts" module>
  // File virtualization and live comparisons can remount a thread mid-reply.
  const drafts = new Map<string, string>();
</script>

<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { ChevronDown, ChevronRight, MessageSquare, Trash2 } from '@lucide/svelte';
  import type { Finding } from '$lib/types';
  import type { CannedResponse, Catalog } from '$lib/config';
  import { appendCannedResponse } from '$lib/canned-responses';
  import { toast } from '$lib/notifications';
  import { rangeLabel } from '$lib/location';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as InputGroup from '$lib/components/ui/input-group';
  import CannedResponsePicker from './CannedResponsePicker.svelte';
  import TimeAgo from './TimeAgo.svelte';

  let { finding, catalog, reviewId, outOfView = false, onreply, onresolve, onreopen, ondelete, ondeletereply, onhistory, isCurrentRevision = () => false }: {
    finding: Finding; catalog: Catalog; reviewId: string; outOfView?: boolean;
    onreply: (id: string, comment: string) => Promise<boolean>;
    ondeletereply: (id: string, replyId: string) => Promise<boolean>;
    onresolve: (id: string) => void; onreopen: (id: string) => void; ondelete: (id: string) => void;
    onhistory?: (finding: Finding) => void; isCurrentRevision?: (finding: Finding) => boolean;
  } = $props();
  const id = $props.id();
  let draftKey = $derived(`${reviewId}:${finding.id}`);
  let reply = $state(untrack(() => drafts.get(draftKey) || ''));
  let expanded = $state(true), replying = $state(false), pending = $state(false);
  let deletingReply = $state('');
  let input = $state<HTMLTextAreaElement | null>(null);
  let replies = $derived(finding.replies || []);

  async function startReply() {
    expanded = true; replying = true;
    await tick(); input?.focus();
  }

  async function insertResponse(response: CannedResponse) {
    if (pending) return;
    try {
      reply = appendCannedResponse(reply, response.content);
      drafts.set(draftKey, reply);
      await startReply();
      input?.setSelectionRange(reply.length, reply.length);
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
  }

  async function sendReply() {
    if (pending || !reply.trim()) return;
    pending = true;
    try {
      if (await onreply(finding.id, reply)) {
        reply = ''; replying = false; drafts.delete(draftKey);
      }
    } finally { pending = false; }
  }

  async function deleteReply(replyId: string) {
    if (pending || deletingReply) return;
    deletingReply = replyId;
    try { await ondeletereply(finding.id, replyId); }
    finally { deletingReply = ''; }
  }
</script>

<article {id} data-thread-id={finding.id} data-cursor="native"
  aria-label={`${finding.ranges ? `Line ${rangeLabel(finding, true)}` : 'File'} comment thread`}
  class="comment-thread my-2 min-w-0 rounded-md border border-border bg-card font-sans text-sm leading-relaxed text-foreground select-text"
  class:resolved={finding.status === 'resolved'}>
  <header class="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2 text-xs">
    <Button variant="ghost" size="icon-xs" aria-label={expanded ? 'Collapse thread' : 'Expand thread'} aria-expanded={expanded} onclick={() => expanded = !expanded}>
      {#if expanded}<ChevronDown />{:else}<ChevronRight />{/if}
    </Button>
    <MessageSquare class="size-3.5 text-muted-foreground" />
    <strong class="font-semibold">{finding.role === 'agent' ? 'Agent' : 'Reviewer'}</strong>
    <span class="text-muted-foreground"><TimeAgo value={finding.createdAt} /></span>
    {#if finding.status === 'resolved'}<span class="rounded bg-(--green)/10 px-1.5 text-(--green)">Resolved</span>{/if}
    {#if outOfView}<span class="text-muted-foreground">{rangeLabel(finding, true)} · Outside the visible diff</span>{/if}
    <Button variant="destructive-ghost" size="icon-xs" class="ml-auto size-6.5 p-0" aria-label="Delete thread" disabled={pending || !!deletingReply} onclick={() => { drafts.delete(draftKey); ondelete(finding.id); }}><Trash2 class="size-4" /></Button>
  </header>
  {#if expanded}
    <p class="m-0 px-4 pt-2 pb-3 wrap-anywhere whitespace-pre-wrap">{finding.comment}</p>
    {#each replies as item (item.id)}
      <div class="border-t border-border/70 px-4 py-3" data-reply-id={item.id}>
        <div class="mb-1 flex flex-wrap items-center gap-2 text-xs">
          <strong class="font-semibold">{item.role === 'agent' ? 'Agent' : 'Reviewer'}</strong><span class="text-muted-foreground"><TimeAgo value={item.createdAt} /></span>
          <Button variant="destructive-ghost" size="icon-xs" class="ml-auto size-6.5 p-0" aria-label="Delete reply" title="Delete reply" disabled={pending || !!deletingReply} aria-busy={deletingReply === item.id} onclick={() => void deleteReply(item.id)}><Trash2 class="size-4" /></Button>
        </div>
        <p class="m-0 wrap-anywhere whitespace-pre-wrap">{item.comment}</p>
      </div>
    {/each}
    {#if finding.resolution && !replies.some(item => item.comment === finding.resolution)}
      <p class="m-0 border-t border-border/70 px-4 py-3 text-muted-foreground wrap-anywhere whitespace-pre-wrap">Resolution: {finding.resolution}</p>
    {/if}
    <footer class="border-t border-border/70 px-3 py-2">
      {#if replying || reply}
        <Textarea bind:ref={input} bind:value={reply} aria-label="Reply to thread" placeholder="Reply to the agent…" rows={2} maxlength={20000} disabled={pending} class="mb-2 min-h-16 resize-y font-sans text-sm leading-relaxed"
          oninput={event => drafts.set(draftKey, event.currentTarget.value)}
          onkeydown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
              event.preventDefault(); event.stopPropagation();
              if (!event.repeat) void sendReply();
            }
          }} />
      {/if}
      <div class="flex flex-wrap items-center gap-2">
        <InputGroup.Root class="h-auto w-fit rounded-md border-0 bg-secondary" aria-label="Reply actions">
          {#if replying || reply}
            <InputGroup.Button variant="secondary" class="rounded-r-none" disabled={pending || !reply.trim()} onclick={sendReply}>{pending ? 'Sending…' : 'Send reply'}</InputGroup.Button>
          {:else}
            <InputGroup.Button variant="secondary" class="rounded-r-none" onclick={startReply}>Reply</InputGroup.Button>
          {/if}
          <CannedResponsePicker {catalog} compact disabled={pending} onselect={insertResponse} />
        </InputGroup.Root>
        {#if replying || reply}
          <Button variant="ghost" size="xs" disabled={pending} onclick={() => { reply = ''; replying = false; drafts.delete(draftKey); }}>Cancel</Button>
          <span class="text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line</span>
        {/if}
        <div class="ml-auto flex items-center gap-1">
          {#if finding.version && onhistory}<Button variant="ghost" size="xs" disabled={isCurrentRevision(finding)} onclick={() => onhistory?.(finding)}>{isCurrentRevision(finding) ? 'Current revision' : 'View revision'}</Button>{/if}
          <Button variant="ghost" size="xs" disabled={pending} onclick={() => finding.status === 'open' ? onresolve(finding.id) : onreopen(finding.id)}>{finding.status === 'open' ? 'Resolve' : 'Reopen'}</Button>
        </div>
      </div>
    </footer>
  {:else}
    <button class="block w-full truncate px-4 pt-1 pb-3 text-left text-muted-foreground" onclick={() => expanded = true}>
      {finding.comment}{replies.length ? ` · ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : ''}
    </button>
  {/if}
</article>
