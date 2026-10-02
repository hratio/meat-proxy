<script lang="ts">
  import { BookOpen, ChevronDown, Layers3, ListChecks, Menu, Settings, Wrench } from '@lucide/svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as InputGroup from '$lib/components/ui/input-group';

  let { compact, fallbackTrigger, openFindings, findingsOpen, settingsOpen, devOpen, onfindings, onrules, onhelp, onsettings, ondev }: {
    compact: boolean; fallbackTrigger: HTMLButtonElement | null; openFindings: number;
    findingsOpen: boolean; settingsOpen: boolean; devOpen: boolean;
    onfindings: () => void; onrules: () => void; onhelp: () => void;
    onsettings: () => void; ondev?: () => void;
  } = $props();
  let open = $state(false);
  let trigger = $state<HTMLButtonElement | null>(null);
  let selected: (() => void) | undefined;

  $effect(() => { if (!compact) open = false; });

  function restoreFocus(event: Event) {
    if (!selected && compact) return;
    event.preventDefault();
    (compact ? trigger : fallbackTrigger)?.focus({ preventScroll: true });
    // Open the next panel after the menu releases its focus scope. Its return
    // target is the persistent toolbar button, rather than a removed menu item.
    const action = selected;
    selected = undefined;
    action?.();
  }
</script>

<InputGroup.Root class="h-11 w-auto self-start justify-self-end bg-card p-1.5 @min-[950px]/toolbar:hidden" aria-label="Review tools">
  <DropdownMenu.Root bind:open onOpenChange={value => { if (value) selected = undefined; }}>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <InputGroup.Button {...props} bind:ref={trigger} size="sm" class="h-8 gap-1.5 px-2" aria-label="Open review tools">
          <Menu /><ChevronDown class="size-3 text-muted-foreground" />
        </InputGroup.Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" sideOffset={8} class="w-56 max-w-[calc(100vw-24px)]" aria-label="Review tools" onCloseAutoFocus={restoreFocus}>
      <DropdownMenu.CheckboxItem checked={findingsOpen} onSelect={() => selected = onfindings}>
        <ListChecks /><span class="flex-1">Findings</span><span class="rounded bg-muted px-1.5 text-xs tabular-nums">{openFindings}</span>
      </DropdownMenu.CheckboxItem>
      <DropdownMenu.Item onSelect={() => selected = onrules}><Layers3 />Rules</DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Item onSelect={() => selected = onhelp}><BookOpen />Field manual</DropdownMenu.Item>
      <DropdownMenu.CheckboxItem checked={settingsOpen} onSelect={() => selected = onsettings}><Settings />Settings</DropdownMenu.CheckboxItem>
      {#if ondev}
        <DropdownMenu.Separator />
        <DropdownMenu.CheckboxItem checked={devOpen} onSelect={() => selected = ondev}><Wrench />Development tools</DropdownMenu.CheckboxItem>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
</InputGroup.Root>
