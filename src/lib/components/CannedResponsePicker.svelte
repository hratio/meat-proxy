<script lang="ts">
  import { ChevronDown, MessageSquareText } from '@lucide/svelte';
  import type { CannedResponse, Catalog } from '$lib/config';
  import { cannedResponseGroups } from '$lib/canned-responses';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as InputGroup from '$lib/components/ui/input-group';
  import { Button } from '$lib/components/ui/button';
  import { useUi } from '$lib/ui/context.svelte';
  import { userPalette } from '$lib/ui/user-colors';

  let { catalog, compact = false, disabled = false, onselect }: {
    catalog: Catalog; compact?: boolean; disabled?: boolean; onselect: (response: CannedResponse) => void;
  } = $props();
  const ui = useUi();
  let groups = $derived(cannedResponseGroups(catalog));
  let chosen: CannedResponse | undefined;
  function restoreFocus(event: Event) {
    if (!chosen) return;
    event.preventDefault();
    const response = chosen; chosen = undefined;
    onselect(response);
  }
</script>

<DropdownMenu.Root onOpenChange={open => { if (open) chosen = undefined; }}>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      {#if compact}
        <InputGroup.Button {...props} variant="secondary" size="icon-xs" class="rounded-l-none border-l border-border/70" aria-label="Canned responses" {disabled}><ChevronDown /></InputGroup.Button>
      {:else}
        <Button {...props} variant="outline" size="sm" {disabled}><MessageSquareText />Canned responses<ChevronDown /></Button>
      {/if}
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start" class="w-64 max-w-[calc(100vw-32px)]" aria-label="Canned responses" onCloseAutoFocus={restoreFocus}>
    <DropdownMenu.Group>
      <DropdownMenu.GroupHeading>Canned responses</DropdownMenu.GroupHeading>
      {#each groups as group (group.id)}
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger aria-label={group.name}>
            <span class="size-2 shrink-0 rounded-full" style:background={userPalette(group.color, ui.colors).foreground}></span>
            <span class="min-w-0 flex-1 truncate">{group.name}</span><span class="text-xs tabular-nums text-muted-foreground">{group.responses.length}</span>
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent class="max-h-[min(24rem,var(--bits-dropdown-menu-content-available-height))] w-80 max-w-[calc(100vw-32px)] overflow-y-auto" aria-label={`Canned responses in ${group.name}`}>
            {#each group.responses as response (response.id)}
              <DropdownMenu.Item aria-label={`${response.id} ${response.title}`} class="items-start gap-2 p-2" onSelect={() => chosen = response}>
                <span class="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">{response.id}</span>
                <span class="min-w-0"><span class="block font-medium wrap-anywhere">{response.title}</span><span class="mt-1 line-clamp-2 text-xs text-muted-foreground wrap-anywhere whitespace-pre-wrap">{response.content}</span></span>
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      {:else}<p class="px-2 py-3 text-xs text-muted-foreground">No canned responses yet. Add one to a group in Rules.</p>{/each}
    </DropdownMenu.Group>
  </DropdownMenu.Content>
</DropdownMenu.Root>
