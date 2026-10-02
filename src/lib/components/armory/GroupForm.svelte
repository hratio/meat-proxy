<script lang="ts">
  import { ArrowLeft, FolderPlus } from '@lucide/svelte';
  import { catalogActionSchema, type CatalogAction, type CatalogChange } from '$lib/catalog-actions';
  import type { Config } from '$lib/config';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import { Label } from '$lib/components/ui/label';
  import WeaponPicker from './WeaponPicker.svelte';
  import CatalogFooter from './CatalogFooter.svelte';

  let { config, onaction, onsaved, onback }: {
    config: Config; onaction: (action: CatalogAction) => Promise<CatalogChange>;
    onsaved: (result: CatalogChange) => void; onback: () => void;
  } = $props();
  const id = $props.id();
  let name = $state(''), color = $state('#a8b494'), weapon = $state('');
  let pending = $state(false), error = $state('');

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (pending) return;
    const parsed = catalogActionSchema.safeParse({ type: 'create-group', fields: { name, color, weapon: weapon || undefined } });
    if (!parsed.success) { error = parsed.error.issues[0].message; return; }
    pending = true; error = '';
    try { onsaved(await onaction(parsed.data)); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { pending = false; }
  }
</script>

<form onsubmit={save} class="flex min-h-0 flex-1 flex-col" aria-label="Create group">
  <div class="min-h-0 flex-1 overflow-y-auto p-6">
    <h1 class="text-2xl font-semibold">New group</h1>
    <p class="mt-2 text-sm text-muted-foreground">Group related V-codes and canned responses.{#if config.experience.mode === 'game'} V-codes can share a default weapon.{/if}</p>
    <div class="mt-6 grid gap-5 rounded-lg border border-border bg-card/40 p-5">
      <div class="grid grid-cols-[minmax(0,1fr)_84px] gap-4">
        <div class="grid gap-2"><Label for={`${id}-name`}>Name</Label><Input id={`${id}-name`} bind:value={name} maxlength={60} required placeholder="e.g. Accessibility" disabled={pending} /></div>
        <div class="grid gap-2"><Label for={`${id}-color`}>Color</Label><ColorPicker id={`${id}-color`} bind:value={color} disabled={pending} /></div>
      </div>
      {#if config.experience.mode === 'game'}<WeaponPicker bind:value={weapon} {config} label="Group weapon" ariaLabel="New group weapon" disabled={pending} />{/if}
    </div>
  </div>
  {#if error}<p role="alert" class="px-6 py-3 text-sm text-destructive">{error}</p>{/if}
  <CatalogFooter>
    {#snippet back()}<Button variant="ghost" disabled={pending} onclick={onback}><ArrowLeft />Back</Button>{/snippet}
    {#snippet actions()}<Button type="submit" disabled={pending}><FolderPlus />{pending ? 'Creating…' : 'Create group'}</Button>{/snippet}
  </CatalogFooter>
</form>
