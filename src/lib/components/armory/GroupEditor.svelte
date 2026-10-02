<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import { onDestroy, untrack } from 'svelte';
  import { Plus, Trash2 } from '@lucide/svelte';
  import { toast } from '$lib/notifications';
  import { groupFieldsSchema, type Catalog, type Config } from '$lib/config';
  import { weaponModel, weaponReference, type WeaponReference } from '$lib/weapons/catalog';
  import type { CatalogAction, CatalogChange } from '$lib/catalog-actions';
  import * as InputGroup from '$lib/components/ui/input-group';
  import * as Table from '$lib/components/ui/table';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import { useUi } from '$lib/ui/context.svelte';
  import { createAutosave, type AutosaveStatus } from '$lib/ui/autosave';
  import { userPalette } from '$lib/ui/user-colors';
  import { Label } from '$lib/components/ui/label';
  import { Button } from '$lib/components/ui/button';
  import Hint from '$lib/components/Hint.svelte';
  import TotemPicker from './TotemPicker.svelte';
  import WeaponPicker from './WeaponPicker.svelte';

  let { group, config, onaction, onselect, oncreate, onselectresponse, oncreateresponse }: {
    group: Catalog['groups'][number]; config: Config;
    onaction: (action: CatalogAction) => Promise<CatalogChange>;
    onselect: (id: string) => void; oncreate: () => void;
    onselectresponse: (id: string) => void; oncreateresponse: () => void;
  } = $props();
  const id = $props.id();
  const ui = useUi();
  let name = $state(untrack(() => group.name));
  let color = $state(untrack(() => group.color));
  let weapon = $state(untrack(() => weaponModel(group.weapon) || ''));
  let pending = $state(false);
  let saveStatus = $state<AutosaveStatus>('idle'), saveError = $state<string>();
  const validation = $derived(groupFieldsSchema.safeParse({ name, color, weapon: weaponReference(weapon) }));
  let codes = $derived(group.codes.filter(code => code.active !== false));
  let responses = $derived((group.responses || []).filter(response => response.active !== false));
  const groupId = untrack(() => group.id);
  let savedGroup = untrack(() => $state.snapshot(group));
  const autosave = createAutosave<{ name: string; color: string; weapon: WeaponReference | undefined }>(async changes => {
    const current = group.id === groupId ? group : savedGroup;
    const fields = groupFieldsSchema.parse({ name: current.name, color: current.color, weapon: current.weapon, ...changes });
    const result = await onaction({ type: 'update-group', groupId, fields });
    savedGroup = result.catalog.groups.find(item => item.id === groupId)!;
  }, (status, error) => { saveStatus = status; saveError = error; });
  let previous = untrack(() => ({ name, color, weapon: weaponReference(weapon) }));
  $effect(() => {
    const next = { name, color, weapon: weaponReference(weapon) };
    untrack(() => {
      for (const key of ['name', 'color', 'weapon'] as const) {
        if (next[key] === previous[key]) continue;
        const parsed = groupFieldsSchema.shape[key].safeParse(next[key]);
        if (parsed.success) autosave.update({ [key]: parsed.data }, key === 'weapon' ? 0 : 300);
        else autosave.cancel(key);
      }
      previous = next;
    });
  });
  onDestroy(() => { void autosave.flush().then(saved => { if (!saved) toast.error(`Could not save group: ${saveError}`); }); });

  async function change(action: CatalogAction) {
    if (pending) return;
    pending = true;
    try { if (await autosave.flush()) await onaction(action); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { pending = false; }
  }
</script>

<div class="grid gap-8">
  <section class="grid gap-4 rounded-lg border border-border bg-card/40 p-5" aria-label="Group details" data-autosave-status={saveStatus}>
    <div class="grid grid-cols-[1fr_84px] items-end gap-4">
      <div class="grid gap-2">
        <Label for={`${id}-name`}>Name</Label>
        <InputGroup.Root>
          <InputGroup.Input id={`${id}-name`} bind:value={name} required maxlength={60} disabled={pending} aria-invalid={!groupFieldsSchema.shape.name.safeParse(name).success} />
          <InputGroup.Addon align="inline-end"><InputGroup.Text>{codes.length} codes</InputGroup.Text></InputGroup.Addon>
        </InputGroup.Root>
      </div>
      <div class="grid gap-2">
        <Label for={`${id}-color`}>Color</Label>
        <ColorPicker id={`${id}-color`} bind:value={color} disabled={pending} />
      </div>
    </div>
    {#if config.experience.mode === 'game'}<div class="flex items-end justify-between gap-4">
      <div class="grid min-w-0 flex-1 gap-2 sm:max-w-xs">
        <span class="text-sm font-medium">Group weapon</span>
        <WeaponPicker value={weapon} {config} disabled={pending} ariaLabel="Group weapon" onchange={value => weapon = value} />
      </div>
    </div>
    {/if}
    {#if !validation.success}<p role="alert" class="text-sm text-destructive">{validation.error.issues[0].message}</p>{/if}
    {#if saveError}
      <div class="flex items-center justify-between gap-3"><p role="alert" class="text-sm text-destructive">Could not save group: {saveError}</p><Button variant="outline" size="sm" onclick={() => void autosave.flush()}>Retry</Button></div>
    {/if}
  </section>

  <section class="grid gap-3">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-lg font-semibold">V-codes <span class="ml-2 text-sm font-normal text-muted-foreground">{codes.length}</span></h2>
      <Button variant="outline" onclick={oncreate}><Plus />New V-code</Button>
    </div>
    <div class="rounded-lg border border-border">
      <Table.Root>
        <Table.Header><Table.Row><Table.Head>Code</Table.Head><Table.Head>Title</Table.Head><Table.Head class="text-right">Customize</Table.Head></Table.Row></Table.Header>
        <Table.Body>
          {#each codes as code (code.id)}
            <Table.Row>
              <Table.Cell class="font-mono text-sm" style={`color: ${userPalette(color, ui.colors).foreground}`}>{code.id}</Table.Cell>
              <Table.Cell class="max-w-[270px]">
                <Button variant="ghost" class="h-auto max-w-full justify-start whitespace-normal px-0 text-left" onclick={() => onselect(code.id)}>{code.title}</Button>
              </Table.Cell>
              <Table.Cell>
                <div class="flex justify-end gap-1.5">
                  <TotemPicker value={code.image} compact disabled={pending} onchange={image => void change({ type: 'update-code', codeId: code.id, fields: { image } })} />
                  {#if config.experience.mode === 'game'}<WeaponPicker value={weaponModel(code.weapon)} {config} compact disabled={pending} ariaLabel={`${code.id} weapon`} inherited="Inherit group weapon" inheritedValue={weaponModel(group.weapon)} onchange={weapon => void change({ type: 'update-code', codeId: code.id, fields: { weapon: weaponReference(weapon) ?? null } })} />{/if}
                  <Hint text={`Delete ${code.id}`}>
                    {#snippet children({ props })}
                      <Button {...mergeProps(props, { onclick: () => void change({ type: 'deactivate-code', codeId: code.id }) })} variant="destructive-ghost" size="icon" aria-label={`Delete ${code.id}`} disabled={pending}
                       ><Trash2 /></Button>
                    {/snippet}
                  </Hint>
                </div>
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row><Table.Cell colspan={3} class="py-10 text-center text-muted-foreground">No active V-codes in this group.</Table.Cell></Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </section>
  <section class="grid gap-3" aria-label="Canned responses">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h2 class="text-lg font-semibold">Canned responses <span class="ml-2 text-sm font-normal text-muted-foreground">{responses.length}</span></h2>
      <Button variant="outline" onclick={oncreateresponse}><Plus />New canned response</Button>
    </div>
    <div class="rounded-lg border border-border">
      <Table.Root>
        <Table.Header><Table.Row><Table.Head>Code</Table.Head><Table.Head>Title</Table.Head><Table.Head class="text-right">Delete</Table.Head></Table.Row></Table.Header>
        <Table.Body>
          {#each responses as response (response.id)}
            <Table.Row>
              <Table.Cell class="font-mono text-sm" style={`color: ${userPalette(color, ui.colors).foreground}`}>{response.id}</Table.Cell>
              <Table.Cell class="max-w-[360px]">
                <Button variant="ghost" class="h-auto max-w-full justify-start whitespace-normal px-0 text-left" onclick={() => onselectresponse(response.id)}>{response.title}</Button>
                <p class="line-clamp-2 text-xs text-muted-foreground">{response.content}</p>
              </Table.Cell>
              <Table.Cell class="text-right"><Button variant="destructive-ghost" size="icon" aria-label={`Delete ${response.id}`} disabled={pending} onclick={() => void change({ type: 'deactivate-response', responseId: response.id })}><Trash2 /></Button></Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row><Table.Cell colspan={3} class="py-8 text-center text-muted-foreground">No canned responses in this group.</Table.Cell></Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </section>
</div>
