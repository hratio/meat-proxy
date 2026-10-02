<script lang="ts">
  import { untrack } from 'svelte';
  import { ArrowLeft, Save, Plus } from '@lucide/svelte';
  import { catalogActionSchema, type CatalogAction, type CatalogChange } from '$lib/catalog-actions';
  import type { Catalog, Config } from '$lib/config';
  import { weaponModel, weaponReference } from '$lib/weapons/catalog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import SingleSelect from '$lib/components/SingleSelect.svelte';
  import CatalogFooter from './CatalogFooter.svelte';
  import CodeEditor from './CodeEditor.svelte';
  import TotemPicker from './TotemPicker.svelte';
  import WeaponPicker from './WeaponPicker.svelte';
  import DestructionMark from './DestructionMark.svelte';

  let { catalog, config, groupId, rule, onaction, onsaved, onback, ondestructionmark, destructionPending = false, backLabel = 'Back to group' }: {
    catalog: Catalog;
    config: Config;
    groupId?: string;
    rule?: Catalog['groups'][number]['codes'][number];
    onaction: (action: CatalogAction) => Promise<CatalogChange>;
    onsaved?: (result: CatalogChange) => void;
    onback?: () => void;
    ondestructionmark?: (id: string) => void;
    destructionPending?: boolean;
    backLabel?: string;
  } = $props();
  const id = $props.id();
  let selectedGroup = $state(untrack(() => groupId || catalog.groups.find(group => group.codes.some(code => code.id === rule?.id))?.id || catalog.groups[0]?.id || ''));
  let title = $state(untrack(() => rule?.title || ''));
  let description = $state(untrack(() => rule?.description || ''));
  let severity = $state<string>(untrack(() => rule?.severity || 'warning'));
  let image = $state(untrack(() => rule?.image || 0));
  let weapon = $state(untrack(() => weaponModel(rule?.weapon) || ''));
  let bad = $state(untrack(() => rule?.bad || ''));
  let good = $state(untrack(() => rule?.good || ''));
  let pending = $state(false), error = $state('');
  let group = $derived(catalog.groups.find(group => group.id === selectedGroup));

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (pending) return; //
    const fields = { title, description, severity, image, bad, good };
    const parsed = catalogActionSchema.safeParse(rule
      ? { type: 'update-code', codeId: rule.id, groupId: selectedGroup, fields: { ...fields, ...(config.experience.mode === 'game' ? { weapon: weaponReference(weapon) ?? null } : {}) } }
      : { type: 'create-code', groupId: selectedGroup, fields: { ...fields, ...(config.experience.mode === 'game' ? { weapon: weaponReference(weapon) } : {}) } });
    if (!parsed.success) { error = parsed.error.issues[0].message; return; }
    pending = true; error = '';
    try {
      const result = await onaction(parsed.data);
      onsaved?.(result);
    }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    finally { pending = false; }
  }
</script>

<form onsubmit={save} data-tutorial={rule ? undefined : 'create-code'} class="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={rule ? `Edit ${rule.id}` : 'Create V-code'}>
  <div class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6" data-catalog-scroll>
    <div class="grid gap-5">
      <div class="flex flex-wrap items-center gap-4">
        <TotemPicker value={image} disabled={pending} onchange={value => image = value} />
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-semibold" class:font-mono={!!rule}>{rule?.id || 'New V-code'}</h1>
        </div>
        {#if rule && config.experience.mode === 'game' && ondestructionmark}
          <DestructionMark selected={catalog.destructionMark === rule.id} pending={destructionPending} disabled={pending}
            ontoggle={() => ondestructionmark?.(catalog.destructionMark === rule!.id ? '' : rule!.id)} />
        {/if}
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <SingleSelect label="Group" bind:value={selectedGroup} disabled={pending} options={catalog.groups.map(group => ({ value: group.id, label: group.name }))} />
        {#if config.experience.mode === 'game'}<WeaponPicker bind:value={weapon} {config} label="Weapon" ariaLabel="V-code weapon" inherited="Inherit group weapon" inheritedValue={weaponModel(group?.weapon)} disabled={pending} />{/if}
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_130px] items-end gap-4">
        <div class="grid gap-2">
          <Label for={`${id}-title`}>Title</Label>
          <Input id={`${id}-title`} bind:value={title} maxlength={100} required placeholder="What went wrong?" disabled={pending} />
        </div>
        <SingleSelect label="Severity" bind:value={severity} disabled={pending} options={[
          { value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }
        ]} />
      </div>
      <div class="grid gap-2">
        <Label for={`${id}-description`}>Description</Label>
        <Textarea id={`${id}-description`} bind:value={description} rows={3} maxlength={5000} required placeholder="Explain the rule and when it applies." disabled={pending} />
      </div>
      <div class="grid gap-2">
        <span class="text-sm font-medium text-foreground">Bad example</span>
        <CodeEditor bind:value={bad} label="Bad example" />
      </div>
      <div class="grid gap-2">
        <span class="text-sm font-medium text-foreground">Good example</span>
        <CodeEditor bind:value={good} label="Good example" />
      </div>
    </div>
  </div>
  {#if error}<p role="alert" class="shrink-0 border-t border-border px-5 py-3 text-sm text-destructive">{error}</p>{/if}
  <CatalogFooter>
    {#snippet back()}
      {#if onback}<Button variant="ghost" disabled={pending} onclick={onback}><ArrowLeft />{backLabel}</Button>{/if}
    {/snippet}
    {#snippet actions()}
      <Button type="submit" disabled={pending || !selectedGroup}>
        {#if rule}<Save />{:else}<Plus />{/if}
        {pending ? 'Saving…' : rule ? 'Save' : 'Create'}
      </Button>
    {/snippet}
  </CatalogFooter>
</form>
