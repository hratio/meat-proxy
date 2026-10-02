<script lang="ts">
  import { untrack } from 'svelte';
  import { Plus, Save, Trash2 } from '@lucide/svelte';
  import { fileFilterFieldsSchema, type FileFilterPreset } from '$lib/file-filter-presets';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import CodeEditor from '$lib/components/armory/CodeEditor.svelte';
  import CatalogFooter from '$lib/components/armory/CatalogFooter.svelte';

  let { preset, pending, onsave, ondelete }: {
    preset?: FileFilterPreset; pending: boolean;
    onsave: (preset: FileFilterPreset) => Promise<void>; ondelete: (id: string) => Promise<void>;
  } = $props();
  const id = $props.id();
  let name = $state(untrack(() => preset?.name || ''));
  let include = $state(untrack(() => ({ text: preset?.include.text || '', regex: preset?.include.regex || false })));
  let exclude = $state(untrack(() => ({ text: preset?.exclude.text || '', regex: preset?.exclude.regex || false })));
  let error = $state('');
  const validation = $derived(fileFilterFieldsSchema.safeParse({ name, include, exclude }));
  const boxes = $derived([{ key: 'include', label: 'Include', rules: include }, { key: 'exclude', label: 'Exclude', rules: exclude }] as const);

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (pending || !validation.success) return;
    error = '';
    try { await onsave({ id: preset?.id || crypto.randomUUID(), ...validation.data }); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
  async function remove() {
    if (pending || !preset) return;
    error = '';
    try { await ondelete(preset.id); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
</script>

<form onsubmit={save} class="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={preset ? 'Edit filter' : 'Create filter'} aria-busy={pending}>
  <div class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
    <div class="grid gap-5">
      <div>
        <h1 class="text-2xl font-semibold">{preset ? 'Edit filter' : 'New filter'}</h1>
        <p class="mt-1 text-sm text-muted-foreground">Match paths relative to the repository. Exclude takes precedence.</p>
      </div>
      <div class="grid gap-2">
        <Label for={`${id}-name`}>Name</Label>
        <Input id={`${id}-name`} bind:value={name} maxlength={60} required placeholder="e.g. Frontend source" disabled={pending} />
      </div>
      {#each boxes as box (box.key)}
        {@const errors = validation.success ? [] : validation.error.issues.filter(issue => issue.path[0] === box.key)}
        <div class="grid gap-2">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm font-medium">{box.label}</span>
            <div class="flex items-center gap-2">
              <Label for={`${id}-${box.key}-regex`} class="text-xs text-muted-foreground">Regex</Label>
              <Switch id={`${id}-${box.key}-regex`} size="sm" checked={box.rules.regex} disabled={pending}
                aria-label={`${box.label} regular expressions`} onCheckedChange={value => box.rules.regex = value} />
            </div>
          </div>
          <CodeEditor bind:value={box.rules.text} label={box.label} language="text" disabled={pending} invalid={!!errors.length} describedBy={`${id}-${box.key}-help ${id}-${box.key}-errors`} />
          <p id={`${id}-${box.key}-help`} class="text-xs text-muted-foreground">
            {box.rules.regex ? 'One case-sensitive regular expression per line, without /…/ delimiters.' : 'One case-sensitive substring per line. Symbols such as * are literal text.'}
            {box.key === 'include' ? ' Leave empty to include every path.' : ' Leave empty to exclude nothing.'}
          </p>
          <div id={`${id}-${box.key}-errors`} aria-live="polite" class="grid gap-1 text-xs text-destructive">
            {#each errors as issue}<p>{issue.message}</p>{/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
  {#if error}<p role="alert" class="shrink-0 border-t border-border px-5 py-3 text-sm text-destructive">{error}</p>{/if}
  <CatalogFooter>
    {#snippet back()}
      {#if preset}<Button variant="destructive-ghost" disabled={pending} onclick={remove}><Trash2 />Delete</Button>{/if}
    {/snippet}
    {#snippet actions()}
      <Button type="submit" disabled={pending || !validation.success}>
        {#if preset}<Save />{:else}<Plus />{/if}{pending ? 'Saving…' : preset ? 'Save' : 'Create'}
      </Button>
    {/snippet}
  </CatalogFooter>
</form>
