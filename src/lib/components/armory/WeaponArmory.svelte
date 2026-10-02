<script lang="ts">
  import { assetUrl } from '$lib/asset-url';
  import { untrack } from 'svelte';
  import { Crosshair, X, Check, Box, ArrowUpRight } from '@lucide/svelte';
  import { weaponCatalog, weaponOptions, type WeaponOption } from '$lib/weapons/catalog';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import SidebarPanel from '$lib/components/SidebarPanel.svelte';
  import PanelFooter from '$lib/components/PanelFooter.svelte';
  import { Button } from '$lib/components/ui/button';
  import WeaponPreview from './WeaponPreview.svelte';
  import CatalogFooter from './CatalogFooter.svelte';

  let { value = '', weapons = weaponOptions, onselect, onclose, reducedMotion = false }: {
    value?: string; weapons?: WeaponOption[]; onselect?: (weapon: string) => void;
    onclose: () => void; reducedMotion?: boolean;
  } = $props();
  let selected = $state(untrack(() => value));
  let weapon = $derived(weapons.find(item => item.value === selected) ?? weapons[0]);
  let asset = $derived(weaponCatalog.find(item => item.url === weapon?.value));
  let content = $state<HTMLElement | null>(null);
  const returnFocus = untrack(() => typeof document === 'undefined' ? null : document.activeElement);

  function restoreFocus(event: Event) {
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      event.preventDefault();
      const target = returnFocus.matches(':disabled') ? returnFocus.closest<HTMLElement>('[role="dialog"]') : returnFocus;
      target?.focus({ preventScroll: true });
    }
  }
</script>

<Dialog.Root open={true} onOpenChange={open => { if (!open) onclose(); }}>
  <Dialog.Content bind:ref={content} showCloseButton={false} overlayClass="z-[240]" onOpenAutoFocus={event => { event.preventDefault(); content?.focus({ preventScroll: true }); }} onCloseAutoFocus={restoreFocus}
    variant="panel" size="xl" fixedHeight class="z-[250]" layoutKey="armory">
    <header class="flex shrink-0 touch-none select-none items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6"
      data-panel-drag role="toolbar" aria-label="Move Armory: drag or use arrow keys" tabindex="0">
      <div class="flex min-w-0 items-center gap-3">
        <Crosshair class="size-5 text-primary" />
        <div><Dialog.Title class="text-xl">Armory</Dialog.Title><Dialog.Description class="mt-0.5 text-xs text-muted-foreground">{onselect ? 'Inspect a weapon, then make it yours.' : 'Explore your weapon collection.'}</Dialog.Description></div>
      </div>
      <Button variant="ghost" size="icon" aria-label="Close armory" onclick={onclose}><X /></Button>
    </header>
    <SidebarPanel label="Weapon collection">
      {#snippet navigation()}
        {#each weapons as item (item.value)}
          {@const detail = weaponCatalog.find(entry => entry.url === item.value)}
          <Sidebar.MenuItem>
            <Sidebar.MenuButton class="h-auto min-h-14 gap-3 px-2.5 py-2" isActive={weapon?.value === item.value} aria-label={item.label} aria-pressed={weapon?.value === item.value} onclick={() => selected = item.value}>
              {#if detail}<img src={assetUrl(`/armory/${detail.id}.webp`)} alt="" class="h-9 w-12 shrink-0 rounded object-cover" loading="lazy" />{:else}<span class="flex h-9 w-12 shrink-0 items-center justify-center rounded bg-muted"><Box class="size-5" /></span>{/if}
              <span class="min-w-0 flex-1"><span class="block text-sm leading-tight font-medium whitespace-normal">{item.label}</span><span class="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground">{detail ? `#${detail.weaponId} · ${detail.type}` : 'Custom weapon'}</span></span>
              {#if item.value === value}<Check class="size-3 shrink-0 text-primary" aria-label="Current weapon" />{/if}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        {/each}
      {/snippet}
      <main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-label="Weapon inspection">
        {#if weapon}
          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:gap-5 sm:p-6">
            <div class="flex shrink-0 items-start justify-between gap-3">
              <div class="min-w-0"><p class="mb-1 text-xs text-muted-foreground">{asset?.type ?? 'Custom weapon'}</p><h2 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{weapon.label}</h2></div>
              <span class="shrink-0 pt-1 font-mono text-xs whitespace-nowrap text-muted-foreground/60">{asset ? `Weapon #${asset.weaponId}` : 'Custom weapon'}</span>
            </div>
            <WeaponPreview url={weapon.value} name={weapon.label} thumbnail={asset ? assetUrl(`/armory/${asset.id}.webp`) : undefined} {reducedMotion} />
          </div>
          <CatalogFooter>
            {#snippet back()}
              <p class="text-sm leading-relaxed text-muted-foreground">{asset?.description ?? 'A custom addition to your loadout.'}</p>
            {/snippet}
            {#snippet actions()}
              {#if onselect}
                <Button class="h-10 shrink-0 gap-2 px-5" onclick={() => onselect?.(weapon.value)}><Crosshair class="size-4" />Select weapon<ArrowUpRight class="size-4 opacity-60" /></Button>
              {/if}
            {/snippet}
          </CatalogFooter>
        {:else}
          <p class="m-auto text-sm text-muted-foreground">No weapons available.</p>
        {/if}
      </main>
    </SidebarPanel>
    <PanelFooter />
  </Dialog.Content>
</Dialog.Root>
