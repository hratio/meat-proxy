<script lang="ts">
  import * as Select from '$lib/components/ui/select';
  import { Label } from '$lib/components/ui/label';
  import { isShellTheme, shellThemes, type ShellTheme } from '$lib/ui/shell-themes';

  let { value = $bindable(), customColors = false, onchange }: { value: ShellTheme; customColors?: boolean; onchange?: () => void } = $props();
  const id = $props.id();
  const selected = $derived(shellThemes.find(theme => theme.id === value)!);
</script>

{#snippet swatch(theme?: ShellTheme)}
  <span data-theme={theme} aria-hidden="true" class="flex h-6 w-12 shrink-0 overflow-hidden rounded-sm border border-border bg-background p-1">
    <span class="w-1/2 rounded-xs bg-secondary"></span><span class="ml-1 w-1/2 rounded-xs bg-primary"></span>
  </span>
{/snippet}

<div class="grid gap-2">
  <Label for={id}>Shell theme</Label>
  <Select.Root type="single" value={customColors ? 'custom' : value} onValueChange={next => { if (isShellTheme(next)) { value = next; onchange?.(); } }}>
    <Select.Trigger {id} size="lg" class="w-full">
      <span class="flex items-center gap-3">{@render swatch(customColors ? undefined : value)}{customColors ? 'Custom colors' : selected.name}</span>
      {#if customColors}<span class="ml-auto text-xs text-muted-foreground">{selected.name} base</span>{/if}
    </Select.Trigger>
    <Select.Content>
      {#if customColors}<Select.Item value="custom" label="Custom colors" disabled>Custom colors</Select.Item><Select.Separator />{/if}
      {#each shellThemes as theme (theme.id)}
        <Select.Item value={theme.id} label={theme.name}>
          <span class="flex items-center gap-3">{@render swatch(theme.id)}<span>{theme.name}</span></span>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>
