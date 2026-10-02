<script lang="ts">
  import { X } from '@lucide/svelte';
  import { toast } from '$lib/notifications';
  import type { Catalog, Config } from '$lib/config';
  import type { CatalogAction, CatalogChange } from '$lib/catalog-actions';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import VcodeForm from './VcodeForm.svelte';

  let { catalog, config, position, onaction, onclose }: {
    catalog: Catalog; config: Config; position: { x: number; y: number };
    onaction: (action: CatalogAction) => Promise<CatalogChange>; onclose: () => void;
  } = $props();
  // A virtual anchor keeps the form attached to the invocation point while the
  // floating primitive handles collisions with the desktop viewport edges.
  const anchor = { getBoundingClientRect: () => new DOMRect(position.x, position.y, 0, 0) };
</script>

<Popover.Root open={true} onOpenChange={open => { if (!open) onclose(); }}>
  <Popover.Content customAnchor={anchor} side="right" align="start" sideOffset={config.display.quickCodeOffsetPx} collisionPadding={16}
    aria-label="New V-code" class="h-[min(780px,calc(100dvh-32px))] max-h-[calc(100dvh-32px)] w-[560px] max-w-[calc(100vw-32px)] gap-0 overflow-hidden p-0" onCloseAutoFocus={event => event.preventDefault()}>
    <header class="flex shrink-0 items-center justify-between border-b border-border px-5 py-3"><h2 class="text-sm font-semibold">Create a rule</h2><Button variant="ghost" size="icon" aria-label="Close new V-code" onclick={onclose}><X /></Button></header>
    <VcodeForm {catalog} {config} {onaction} onback={onclose} backLabel="Cancel" onsaved={result => { toast.success(`${result.codeId} created`); onclose(); }} />
  </Popover.Content>
</Popover.Root>
