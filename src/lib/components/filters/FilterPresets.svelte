<script lang="ts">
  import { untrack } from 'svelte';
  import { Plus, ListFilter, X } from '@lucide/svelte';
  import { mergeProps } from 'bits-ui';
  import type { FileFilterPreset } from '$lib/file-filter-presets';
  import { toast } from '$lib/notifications';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { Button } from '$lib/components/ui/button';
  import Hint from '$lib/components/Hint.svelte';
  import SidebarPanel from '$lib/components/SidebarPanel.svelte';
  import PanelFooter from '$lib/components/PanelFooter.svelte';
  import FilterForm from './FilterForm.svelte';

  let { presets, onchange, onclose, returnFocus }: {
    presets: FileFilterPreset[]; onchange: (presets: FileFilterPreset[]) => Promise<void>; onclose: () => void; returnFocus?: HTMLElement | null;
  } = $props();
  let selected = $state(untrack(() => presets[0]?.id || ''));
  let pending = $state(false);
  let content = $state<HTMLElement | null>(null);
  let preset = $derived(presets.find(item => item.id === selected));

  async function save(value: FileFilterPreset) {
    pending = true;
    try {
      const exists = presets.some(item => item.id === value.id);
      await onchange(exists ? presets.map(item => item.id === value.id ? value : item) : [...presets, value]);
      selected = value.id;
      toast.success(exists ? 'Filter saved' : 'Filter created');
    } finally { pending = false; }
  }
  async function remove(id: string) {
    pending = true;
    try {
      await onchange(presets.filter(item => item.id !== id));
      selected = presets.find(item => item.id !== id)?.id || '';
      toast.success('Filter deleted');
    } finally { pending = false; }
  }
</script>

<Dialog.Root open={true} onOpenChange={open => { if (!open) onclose(); }}>
  <Dialog.Content bind:ref={content} onOpenAutoFocus={event => { event.preventDefault(); content?.focus({ preventScroll: true }); }} onCloseAutoFocus={event => { if (returnFocus?.isConnected) { event.preventDefault(); returnFocus.focus({ preventScroll: true }); } }} showCloseButton={false} aria-describedby={undefined} variant="panel" size="xl" fixedHeight layoutKey="file-filters">
    <header class="flex shrink-0 touch-none select-none items-center justify-between gap-3 border-b border-border px-6 py-4"
      data-panel-drag role="toolbar" aria-label="Move filter presets: drag or use arrow keys" tabindex="0">
      <div class="flex min-w-0 items-center gap-3"><ListFilter class="size-5 shrink-0 text-primary" /><Dialog.Title class="text-xl">Filter presets</Dialog.Title></div>
      <div class="flex shrink-0 items-center gap-3">
        <Button variant="outline" disabled={pending} onclick={() => selected = ''}><Plus />New filter</Button>
        <Hint text="Close filter presets">{#snippet children({ props })}<Button {...mergeProps(props, { onclick: onclose })} variant="ghost" size="icon" aria-label="Close filter presets"><X /></Button>{/snippet}</Hint>
      </div>
    </header>
    <SidebarPanel label="Saved filters">
      {#snippet navigation()}
        {#each presets as item (item.id)}
          <Sidebar.MenuItem><Sidebar.MenuButton isActive={preset?.id === item.id} aria-disabled={pending} class="h-auto min-h-10 text-sm aria-disabled:opacity-50" onclick={() => { if (!pending) selected = item.id; }}><ListFilter /><span>{item.name}</span></Sidebar.MenuButton></Sidebar.MenuItem>
        {:else}
          <li class="px-2 py-3 text-sm text-muted-foreground">Your saved filters will appear here.</li>
        {/each}
      {/snippet}
      <main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-label="Filter editor">
        {#key preset?.id || 'new'}<FilterForm {preset} {pending} onsave={save} ondelete={remove} />{/key}
      </main>
    </SidebarPanel>
    <PanelFooter />
  </Dialog.Content>
</Dialog.Root>
