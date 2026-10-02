<script lang="ts" module>
  export type SelectOption = { value: string; label: string; disabled?: boolean };
</script>

<script lang="ts">
  import * as Select from '$lib/components/ui/select';
  import { Label } from '$lib/components/ui/label';

  let { label, value = $bindable(''), options, placeholder = 'Select…', disabled = false, onchange }: {
    label: string;
    value?: string;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    onchange?: (value: string) => void;
  } = $props();
  const id = $props.id();
  let selected = $derived(options.find(option => option.value === value));

  function change(next: string) {
    value = next;
    onchange?.(next);
  }
</script>

<div class="grid min-w-0 gap-2">
  <Label for={id} class="text-xs text-muted-foreground">{label}</Label>
  <Select.Root type="single" {value} onValueChange={change} disabled={disabled || !options.length}>
    <Select.Trigger {id} size="lg" class="w-full min-w-0">
      <span class="truncate">{selected?.label ?? placeholder}</span>
    </Select.Trigger>
    <Select.Content class="max-w-[min(540px,calc(100vw-32px))]">
      {#each options as option (option.value)}
        <Select.Item value={option.value} label={option.label} disabled={option.disabled}>
          <span class="min-w-0 whitespace-normal break-words">{option.label}</span>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>
