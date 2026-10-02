<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import { untrack, type Snippet } from 'svelte';
  import { X, Layers3, FolderPlus, FilePlus2, MessageSquarePlus } from '@lucide/svelte';
  import { toast } from '$lib/notifications';
  import type { Catalog, Config } from '$lib/config';
  import type { CatalogAction, CatalogChange } from '$lib/catalog-actions';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import SidebarPanel from '$lib/components/SidebarPanel.svelte';
  import PanelFooter from '$lib/components/PanelFooter.svelte';
  import { Button } from '$lib/components/ui/button';
  import Hint from '$lib/components/Hint.svelte';
  import GroupEditor from './GroupEditor.svelte';
  import GroupForm from './GroupForm.svelte';
  import VcodeForm from './VcodeForm.svelte';
  import CannedResponseForm from './CannedResponseForm.svelte';
  import { useUi } from '$lib/ui/context.svelte';
  import { userPalette } from '$lib/ui/user-colors';

  let { catalog, config, onaction, onclose, guidance }: {
    catalog: Catalog; config: Config; onaction: (action: CatalogAction) => Promise<CatalogChange>; onclose: () => void;
    guidance?: Snippet;
  } = $props();
  const ui = useUi();
  let groupId = $state(untrack(() => catalog.groups[0]?.id || ''));
  let codeId = $state('');
  let responseId = $state('');
  let creating = $state(false), creatingGroup = $state(false), creatingResponse = $state(false);
  let destructionPending = $state(false);
  let content = $state<HTMLElement | null>(null);
  const returnFocus = untrack(() => typeof document === 'undefined' ? null : document.activeElement);
  let group = $derived(catalog.groups.find(group => group.id === groupId) || catalog.groups[0]);
  let rule = $derived(group?.codes.find(code => code.id === codeId && code.active !== false));
  let response = $derived(group?.responses?.find(response => response.id === responseId && response.active !== false));

  function selectGroup(id: string) { groupId = id; codeId = ''; responseId = ''; creating = false; creatingGroup = false; creatingResponse = false; }
  function selectCode(id: string) { selectGroup(groupId); codeId = id; }
  function selectResponse(id: string) { selectGroup(groupId); responseId = id; }
  function createCode(id: string) { selectGroup(id); creating = true; }
  function createResponse(id: string) { selectGroup(id); creatingResponse = true; }
  function saved(result: CatalogChange) {
    if (result.groupId) groupId = result.groupId;
    if (result.responseId) selectResponse(result.responseId);
    else selectCode(result.codeId || codeId);
  }
  function focusContent(event: Event) { event.preventDefault(); content?.focus({ preventScroll: true }); }
  async function selectDestructionMark(id: string) {
    if (destructionPending) return;
    destructionPending = true;
    try { await onaction({ type: 'set-destruction-mark', mark: id }); }
    catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { destructionPending = false; }
  }
  function restoreFocus(event: Event) {
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      event.preventDefault(); returnFocus.focus({ preventScroll: true });
    }
  }
</script>

<Dialog.Root open={true} onOpenChange={open => { if (!open) onclose(); }}>
  <Dialog.Content bind:ref={content} onOpenAutoFocus={focusContent} onCloseAutoFocus={restoreFocus} showCloseButton={false} aria-describedby={undefined} variant="panel" size="xl" fixedHeight layoutKey="command">
    <header class="flex shrink-0 touch-none select-none items-center justify-between border-b border-border px-6 py-4"
      data-panel-drag role="toolbar" aria-label="Move Command: drag or use arrow keys" tabindex="0">
      <div class="flex items-center gap-3"><Layers3 class="size-5 text-primary" /><Dialog.Title class="text-xl">Command</Dialog.Title><span class="text-xs text-muted-foreground">Rules & responses</span></div>
      <div class="flex items-center gap-3">
        <Button variant="outline" onclick={() => { selectGroup(groupId); creatingGroup = true; }}><FolderPlus />New group</Button>
        <Hint text="Close command">{#snippet children({ props })}<Button {...mergeProps(props, { onclick: onclose })} variant="ghost" size="icon" aria-label="Close command"><X /></Button>{/snippet}</Hint>
      </div>
    </header>
    {#if guidance}{@render guidance()}{/if}
    <SidebarPanel label="Command groups and rules">
      {#snippet navigation()}
        {#each catalog.groups as item (item.id)}
          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={group?.id === item.id && !rule && !response && !creating && !creatingGroup && !creatingResponse} class="h-auto min-h-10 pr-16 text-sm" onclick={() => selectGroup(item.id)}>
              <span class="size-2 shrink-0 rounded-full" style:background={userPalette(item.color, ui.colors).foreground}></span><span>{item.name}</span>
            </Sidebar.MenuButton>
            <Sidebar.MenuAction data-tutorial={group?.id === item.id ? 'new-code' : undefined} aria-label={`New V-code in ${item.name}`} title="New V-code" class="top-2.5 right-9 size-5" onclick={() => createCode(item.id)}><FilePlus2 /></Sidebar.MenuAction>
            <Sidebar.MenuAction aria-label={`New canned response in ${item.name}`} title="New canned response" class="top-2.5 right-2 size-5" onclick={() => createResponse(item.id)}><MessageSquarePlus /></Sidebar.MenuAction>
            <Sidebar.MenuSub class="mr-0">
              {#each item.codes.filter(code => code.active !== false) as code (code.id)}
                <Sidebar.MenuSubItem>
                  <Sidebar.MenuSubButton isActive={rule?.id === code.id} size="row">
                    {#snippet child({ props })}
                      <button {...mergeProps(props, { onclick: () => { groupId = item.id; selectCode(code.id); } })} type="button" aria-label={`${code.id} ${code.title}`}>
                        <span class="shrink-0 font-mono text-xs text-muted-foreground">{code.id}</span><span class="truncate">{code.title}</span>
                      </button>
                    {/snippet}
                  </Sidebar.MenuSubButton>
                </Sidebar.MenuSubItem>
              {/each}
              {#each (item.responses || []).filter(response => response.active !== false) as response (response.id)}
                <Sidebar.MenuSubItem>
                  <Sidebar.MenuSubButton isActive={responseId === response.id} size="row">
                    {#snippet child({ props })}
                      <button {...mergeProps(props, { onclick: () => { groupId = item.id; selectResponse(response.id); } })} type="button" aria-label={`${response.id} ${response.title}`}>
                        <span class="shrink-0 font-mono text-xs text-muted-foreground">{response.id}</span><span class="truncate">{response.title}</span>
                      </button>
                    {/snippet}
                  </Sidebar.MenuSubButton>
                </Sidebar.MenuSubItem>
              {/each}
            </Sidebar.MenuSub>
          </Sidebar.MenuItem>
        {/each}
      {/snippet}
      <main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-label="Catalog editor">
        {#if creatingGroup}
          <GroupForm {config} {onaction} onback={() => selectGroup(groupId)} onsaved={result => { selectGroup(result.groupId!); toast.success('Group created'); }} />
        {:else if creatingResponse || response}
          {#key response?.id || `new-response-${group.id}`}<CannedResponseForm {catalog} {config} groupId={group.id} {response} {onaction} ondestructionmark={selectDestructionMark} {destructionPending} onback={() => selectGroup(group.id)} onsaved={result => { saved(result); toast.success('Canned response saved'); }} />{/key}
        {:else if creating}
          {#key group.id}
            <VcodeForm {catalog} {config} groupId={group.id} {onaction} onback={() => selectGroup(group.id)} onsaved={result => { saved(result); toast.success(`${result.codeId} created`); }} />
          {/key}
        {:else if rule}
          {#key rule.id}<VcodeForm {catalog} {config} {rule} {onaction} ondestructionmark={selectDestructionMark} {destructionPending} onback={() => selectGroup(group.id)} onsaved={result => { saved(result); toast.success('V-code saved'); }} />{/key}
        {:else if group}
          <div class="min-h-0 flex-1 overflow-y-auto p-6">
            <div class="mb-6 min-w-0"><h1 class="truncate text-2xl font-semibold">{group.name}</h1></div>
            {#key group.id}<GroupEditor {group} {config} {onaction} onselect={selectCode} oncreate={() => createCode(group.id)} onselectresponse={selectResponse} oncreateresponse={() => createResponse(group.id)} />{/key}
          </div>
        {/if}
      </main>
    </SidebarPanel>
    <PanelFooter />
  </Dialog.Content>
</Dialog.Root>
