<script lang="ts">
  import { tick } from 'svelte';
  import { Mouse, Keyboard } from '@lucide/svelte';
  import { activeBindings, commandScope, type Command } from '$lib/experience';
  import type { Config } from '$lib/config';
  import { Button } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';

  let { config }: { config: Config } = $props();
  const bindings = $derived(activeBindings(config));
  let listening = $state<Command | null>(null);
  let captureHint = $state('');
  let returnFocus: HTMLButtonElement | null = null;
  type Change = { section: 'bindings' | 'reviewBindings'; action: Command; binding: string };
  let pending = $state<{ action: Command; binding: string; changes: Change[]; conflicts: string[] } | null>(null);

  const controls: Record<Command, { label: string; description?: string }> = {
    mainGroupPrev: { label: 'Previous group', description: 'Select the previous rule group.' },
    mainGroupNext: { label: 'Next group', description: 'Select the next rule group.' },
    mainCodePrev: { label: 'Previous V-code', description: 'Select the previous rule in this group.' },
    mainCodeNext: { label: 'Next V-code', description: 'Select the next rule in this group.' },
    secondaryGroupPrev: { label: 'Previous group', description: 'Select the previous rule group.' },
    secondaryGroupNext: { label: 'Next group', description: 'Select the next rule group.' },
    secondaryCodePrev: { label: 'Previous V-code', description: 'Select the previous rule in this group.' },
    secondaryCodeNext: { label: 'Next V-code', description: 'Select the next rule in this group.' },
    mainToggle: { label: 'Toggle weapon', description: 'Draw or holster the primary weapon.' },
    secondaryToggle: { label: 'Toggle weapon', description: 'Draw or holster the secondary weapon.' },
    mainFire: { label: 'Fire', description: 'Mark findings with the primary weapon’s rule.' },
    secondaryFire: { label: 'Fire', description: 'Mark findings with the secondary weapon’s rule.' },
    reload: { label: 'Reload' },
    erase: { label: 'Erase', description: 'Remove findings under the pointer.' },
    comment: { label: 'Comment', description: 'Add a comment to the pointed line or file.' },
    addVcode: { label: 'Add V-code', description: 'Create a rule in the V-code catalog.' },
    completeFile: { label: 'Complete file', description: 'Mark the hovered or current file as reviewed.' },
    destroyFile: { label: 'Toggle file destruction', description: 'Target the aimed file for character destruction. Shooting it counts toward completion.' },
    destroyAll: { label: 'Toggle all-file destruction', description: 'Target all unreviewed files, or clear every destruction target.' },
    undo: { label: 'Undo', description: 'Revert the last finding, comment, or completion change.' },
    redo: { label: 'Redo', description: 'Restore the review change you just undid.' },
    toggleFile: { label: 'Toggle file', description: 'Expand or collapse the hovered file’s diff.' },
    nextFile: { label: 'Next file' },
    prevFile: { label: 'Previous file' },
    nextUnreviewed: { label: 'Next unreviewed file' },
    toggleScroll: { label: 'Toggle auto-scroll', description: 'Start or pause automatic diff scrolling.' },
    findings: { label: 'Toggle findings', description: 'Show or hide the findings panel.' }
  };
  const groups: { label: string; actions: Command[] }[] = [
    { label: 'Primary weapon', actions: ['mainGroupPrev', 'mainGroupNext', 'mainCodePrev', 'mainCodeNext', 'mainToggle', 'mainFire', 'reload'] },
    { label: 'Secondary weapon', actions: ['secondaryGroupPrev', 'secondaryGroupNext', 'secondaryCodePrev', 'secondaryCodeNext', 'secondaryToggle', 'secondaryFire'] },
    { label: 'Review actions', actions: ['erase', 'comment', 'addVcode', 'completeFile', 'undo', 'redo'] },
    { label: 'Destruction', actions: ['destroyFile', 'destroyAll'] },
    { label: 'Navigation & panels', actions: ['toggleFile', 'nextFile', 'prevFile', 'nextUnreviewed', 'toggleScroll', 'findings'] }
  ];
  const visibleGroups = $derived(groups.map(group => ({ ...group, actions: group.actions.filter(action => bindings.some(([command]) => command === action)) })).filter(group => group.actions.length));
  const actionLabel = (action: Command) => {
    const group = groups.find(group => group.actions.includes(action));
    return `${commandScope[action] === 'game' && action !== 'reload' ? `${group?.label}: ` : ''}${controls[action].label}`;
  };
  const keyLabels: Record<string, string> = { ctrl: 'Ctrl', alt: 'Alt', meta: 'Meta', shift: 'Shift', space: 'Space', escape: 'Esc', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', mouse1: 'Left click', mouse2: 'Middle click', mouse3: 'Right click', mouse4: 'Mouse 4', mouse5: 'Mouse 5' };
  // The final key can itself be "+" (for example ctrl++).
  const keyParts = (binding: string) => binding.match(/[^+]+|\+$/g)?.map(part => keyLabels[part.toLowerCase()] ?? part.toUpperCase()) ?? [];
  const keyLabel = (binding: string) => keyParts(binding).join(' + ');

  export function cancelAssignment() {
    if (!listening && !pending) return false;
    listening = null; pending = null; captureHint = '';
    return true;
  }
  function setBinding(target: Config, change: Change) {
    if (change.section === 'bindings') target.bindings[change.action] = change.binding;
    else target.reviewBindings[change.action as keyof Config['reviewBindings']] = change.binding;
  }
  function assign(changes: Change[]) {
    // Apply the unbind and assignment in one update, so autosave never sees duplicates.
    for (const change of changes) setBinding(config, change);
    listening = null; captureHint = '';
  }
  function capture(event: KeyboardEvent | MouseEvent) {
    if (!listening || pending) return;
    event.preventDefault(); event.stopPropagation();
    if ('key' in event && event.key === 'Escape') { cancelAssignment(); return; }
    if ('key' in event && event.key === 'Tab') { captureHint = 'Tab is reserved for navigating controls.'; return; }
    if ('key' in event && (event.repeat || event.isComposing || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key))) return;
    const key = 'key' in event ? event.key === ' ' ? 'space' : event.key.toLowerCase() : `mouse${event.button + 1}`;
    const binding = [event.ctrlKey ? 'ctrl' : '', event.altKey ? 'alt' : '', event.metaKey ? 'meta' : '', event.shiftKey ? 'shift' : '', key].filter(Boolean).join('+');
    const action = listening;
    const section = config.experience.mode === 'game' ? 'bindings' : 'reviewBindings';
    const changes: Change[] = [{ section, action, binding }];
    const conflicts: string[] = [];
    const preview = structuredClone($state.snapshot(config));
    setBinding(preview, changes[0]);
    for (const [previous, value] of bindings) {
      if (previous === action || value.toLowerCase() !== binding) continue;
      const change: Change = { section, action: previous, binding: '' };
      changes.push(change); setBinding(preview, change);
      conflicts.push(actionLabel(previous));
    }
    // A shared game shortcut also changes its inherited Serious mode shortcut.
    // Ask about any extra conflict with an explicit Serious mode override.
    if (section === 'bindings' && commandScope[action] === 'shared' && activeBindings(preview, 'review').some(([command, value]) => command === action && value.toLowerCase() === binding)) {
      for (const [previous, value] of activeBindings(preview, 'review')) {
        if (previous === action || value.toLowerCase() !== binding) continue;
        changes.push({ section: 'reviewBindings', action: previous, binding: '' });
        conflicts.push(`${actionLabel(previous)} (Serious mode)`);
      }
    }
    if (conflicts.length) { pending = { action, binding, changes, conflicts }; listening = null; }
    else assign(changes);
  }
  function startAssignment(action: Command, event: MouseEvent) {
    if (listening === action && event.detail > 0) { capture(event); return; }
    returnFocus = event.currentTarget as HTMLButtonElement;
    listening = action; captureHint = '';
  }
  function restoreFocus(event: Event) {
    event.preventDefault();
    void tick().then(() => returnFocus?.isConnected && returnFocus.focus({ preventScroll: true }));
  }
</script>

<svelte:window onkeydown={capture} />

<div class="grid gap-7" data-key-bindings>
  {#each visibleGroups as group}
    <section aria-label={group.label}>
      <h3 class="mb-2 text-xs font-semibold text-muted-foreground">{group.label}</h3>
      <div class="divide-y divide-border/50 rounded-xl border border-border/70 bg-card/30 px-3 sm:px-4">
        {#each group.actions as action}
          {@const control = controls[action]}
          {@const binding = bindings.find(([command]) => command === action)?.[1] ?? ''}
          <div class="binding-row flex items-center justify-between gap-4 py-3" data-binding-action={action} data-listening={listening === action}>
            <div class="min-w-0">
              <p class="text-sm font-medium text-foreground" id={`binding-${action}-label`}>{control.label}</p>
              {#if control.description}<p id={`binding-${action}-help`} class="mt-1 text-xs leading-relaxed text-muted-foreground">{control.description}</p>{/if}
              {#if listening === action}<p class="mt-1 text-xs text-primary" role="status">{captureHint || 'Press a key or mouse button. Esc cancels.'}</p>{/if}
            </div>
            <Button variant="outline" size="sm" selected={listening === action} class="binding-button h-auto min-h-9 min-w-24 max-w-full flex-wrap gap-1.5 rounded-md bg-background/70 px-3 py-2 shadow-xs"
              aria-label={`Reassign ${actionLabel(action)}: ${binding ? keyLabel(binding) : 'Unbound'}`}
              aria-describedby={control.description ? `binding-${action}-help` : undefined}
              aria-pressed={listening === action}
              onpointerdown={event => { if (listening === action && event.button !== 0) capture(event); }}
              oncontextmenu={event => event.preventDefault()}
              onauxclick={event => event.preventDefault()}
              onclick={event => startAssignment(action, event)}>
              {#if listening === action}<Keyboard class="size-3.5" /><span class="text-xs">Press a key…</span>
              {:else if !binding}<span class="text-xs text-muted-foreground">Unbound</span>
              {:else}
                {#if /mouse\d+$/i.test(binding)}<Mouse class="size-3.5 text-muted-foreground" />{/if}
                {#each keyParts(binding) as part, index}
                  {#if index}<span class="text-xs text-muted-foreground" aria-hidden="true">+</span>{/if}
                  <span class="font-mono text-xs">{part}</span>
                {/each}
              {/if}
            </Button>
          </div>
        {/each}
      </div>
    </section>
  {/each}
</div>

{#if pending}
  <AlertDialog.Root open={true} onOpenChange={open => { if (!open) pending = null; }}>
    <AlertDialog.Content onCloseAutoFocus={restoreFocus}>
      <AlertDialog.Header>
        <AlertDialog.Title>Reassign {keyLabel(pending.binding)}?</AlertDialog.Title>
        <AlertDialog.Description>
          Already used by <strong class="font-medium text-foreground">{pending.conflicts.join(' and ')}</strong>.
          Unbind {pending.conflicts.length === 1 ? 'that action' : 'those actions'} and assign it to <strong class="font-medium text-foreground">{actionLabel(pending.action)}</strong>?
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
        <AlertDialog.Action onclick={() => { if (pending) assign(pending.changes); pending = null; }}>Unbind & assign</AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}

<style>
  .binding-row[data-listening='true'] :global(.binding-button) { border-color: var(--ring); box-shadow: 0 0 0 2px color-mix(in oklch, var(--ring) 18%, transparent); }
  @media (max-width: 560px) {
    .binding-row { align-items: flex-start; flex-wrap: wrap; gap: .5rem; }
    .binding-row :global(.binding-button) { margin-left: auto; }
  }
</style>
