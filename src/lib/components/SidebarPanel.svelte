<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { ScrollArea } from '$lib/components/ui/scroll-area';

  let { label, navigation, children }: { label: string; navigation: Snippet; children: Snippet } = $props();
</script>

<Sidebar.Provider keyboardShortcut={false} style="--sidebar-width:var(--panel-sidebar-width)" class="min-h-0 flex-1 overflow-hidden [--panel-sidebar-width:15rem] max-sm:[--panel-sidebar-width:10rem]">
  <Sidebar.Root collapsible="none" class="min-h-0 shrink-0 border-r border-border bg-card/30">
    <Sidebar.Content class="overflow-hidden">
      <ScrollArea type="auto" class="h-full min-h-0 flex-1">
        <nav aria-label={label}>
          <Sidebar.Menu class="p-3 max-sm:p-2">
            {@render navigation()}
          </Sidebar.Menu>
        </nav>
      </ScrollArea>
    </Sidebar.Content>
  </Sidebar.Root>
  {@render children()}
</Sidebar.Provider>
