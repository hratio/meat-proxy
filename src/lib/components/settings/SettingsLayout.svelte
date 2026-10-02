<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import SidebarPanel from '$lib/components/SidebarPanel.svelte';
  import type { SettingsGroup } from './navigation';

  let { groups, value = $bindable(), label, children }: {
    groups: SettingsGroup[]; value: string; label: string; children: Snippet;
  } = $props();
  const group = $derived(groups.find(group => group.pages.some(page => page.id === value)) ?? groups[0]);
  const page = $derived(group.pages.find(page => page.id === value) ?? group.pages[0]);
  $effect(() => { if (value !== page.id) value = page.id; });
</script>

<SidebarPanel {label}>
  {#snippet navigation()}
    {#each groups as item (item.id)}
      <Sidebar.MenuItem>
        <Sidebar.MenuButton class="h-10" onclick={() => value = item.pages[0].id}>
          <item.icon class="size-4" /><span>{item.label}</span>
        </Sidebar.MenuButton>
        <Sidebar.MenuSub class="mr-0 py-1">
          {#each item.pages as entry (entry.id)}
            <Sidebar.MenuSubItem>
              <Sidebar.MenuSubButton isActive={value === entry.id} size="wrap">
                {#snippet child({ props })}
                  <button {...mergeProps(props, { onclick: () => value = entry.id })} type="button" aria-current={value === entry.id ? 'page' : undefined}>{entry.label}</button>
                {/snippet}
              </Sidebar.MenuSubButton>
            </Sidebar.MenuSubItem>
          {/each}
        </Sidebar.MenuSub>
      </Sidebar.MenuItem>
    {/each}
  {/snippet}
  <section class="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={page.label}>
    <header class="shrink-0 border-b border-border/60 px-4 py-4 sm:px-6">
      <p class="mb-1 text-xs text-muted-foreground">{group.label}</p>
      <h2 class="text-xl font-semibold tracking-tight">{page.label}</h2>
      {#if page.description}<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{page.description}</p>{/if}
    </header>
    {#key value}
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" data-settings-content>
        {@render children()}
      </div>
    {/key}
  </section>
</SidebarPanel>
