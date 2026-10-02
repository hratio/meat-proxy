<script lang="ts">
  import { untrack } from 'svelte';
  import { ArrowLeft, Save, Plus, Trash2 } from '@lucide/svelte';
  import { cannedResponseFieldsSchema, type CannedResponse, type Catalog, type Config } from '$lib/config';
  import { catalogActionSchema, type CatalogAction, type CatalogChange } from '$lib/catalog-actions';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import SingleSelect from '$lib/components/SingleSelect.svelte';
  import CatalogFooter from './CatalogFooter.svelte';
  import DestructionMark from './DestructionMark.svelte';

  let { catalog, config, groupId, response, onaction, onsaved, onback, ondestructionmark, destructionPending = false }: {
    catalog: Catalog; config: Config; groupId: string; response?: CannedResponse;
    onaction: (action: CatalogAction) => Promise<CatalogChange>; onsaved: (result: CatalogChange) => void; onback: () => void;
    ondestructionmark: (id: string) => void; destructionPending?: boolean;
  } = $props();
  const id = $props.id();
  let selectedGroup = $state(untrack(() => groupId));
  let title = $state(untrack(() => response?.title || ''));
  let content = $state(untrack(() => response?.content || ''));
  let pending = $state(false), error = $state('');
  const valid = $derived(cannedResponseFieldsSchema.safeParse({ title, content }).success);

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (pending) return;
    const parsed = catalogActionSchema.safeParse(response
      ? { type: 'update-response', responseId: response.id, groupId: selectedGroup, fields: { title, content } }
      : { type: 'create-response', groupId: selectedGroup, fields: { title, content } });
    if (!parsed.success) { error = parsed.error.issues[0].message; return; }
    pending = true; error = '';
    try { onsaved(await onaction(parsed.data)); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { pending = false; }
  }
  async function remove() {
    if (!response || pending) return;
    pending = true; error = '';
    try { await onaction({ type: 'deactivate-response', responseId: response.id }); onback(); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { pending = false; }
  }
</script>

<form onsubmit={save} class="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={response ? `Edit ${response.id}` : 'Create canned response'} aria-busy={pending}>
  <div class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6" data-catalog-scroll>
    <div class="grid gap-5">
      <div class="flex flex-wrap items-center gap-4">
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-semibold" class:font-mono={!!response}>{response?.id || 'New canned response'}</h1>
          <p class="mt-1 text-sm text-muted-foreground">Reusable text for comments and replies.</p>
        </div>
        {#if response && config.experience.mode === 'game'}
          <DestructionMark selected={catalog.destructionMark === response.id} pending={destructionPending} disabled={pending}
            ontoggle={() => ondestructionmark(catalog.destructionMark === response!.id ? '' : response!.id)} />
        {/if}
      </div>
      <SingleSelect label="Group" bind:value={selectedGroup} disabled={pending} options={catalog.groups.map(group => ({ value: group.id, label: group.name }))} />
      <div class="grid gap-2">
        <Label for={`${id}-title`}>Title</Label>
        <Input id={`${id}-title`} bind:value={title} maxlength={100} required placeholder="e.g. Add a regression test" disabled={pending} />
      </div>
      <div class="grid gap-2">
        <Label for={`${id}-content`}>Content</Label>
        <Textarea id={`${id}-content`} bind:value={content} maxlength={20000} required placeholder="Write the text to insert into a comment or reply." rows={12} disabled={pending} class="min-h-48 resize-y leading-relaxed" />
      </div>
    </div>
  </div>
  {#if error}<p role="alert" class="shrink-0 border-t border-border px-5 py-3 text-sm text-destructive">{error}</p>{/if}
  <CatalogFooter>
    {#snippet back()}<Button variant="ghost" disabled={pending} onclick={onback}><ArrowLeft />Back to group</Button>{/snippet}
    {#snippet actions()}
      {#if response}<Button variant="destructive-ghost" disabled={pending} onclick={remove}><Trash2 />Delete</Button>{/if}
      <Button type="submit" disabled={pending || !selectedGroup || !valid}>{#if response}<Save />{:else}<Plus />{/if}{pending ? 'Saving…' : response ? 'Save' : 'Create'}</Button>
    {/snippet}
  </CatalogFooter>
</form>
