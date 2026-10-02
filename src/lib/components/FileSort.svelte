<script lang="ts">
  import { ArrowDownWideNarrow } from '@lucide/svelte';
  import * as Select from '$lib/components/ui/select';
  import { fileSortOptions, type FileSort } from '$lib/file-list';
  let { value, onchange }: { value: FileSort; onchange: (value: FileSort) => void } = $props();
</script>

<Select.Root type="single" {value} onValueChange={next => onchange(next as FileSort)}>
  <Select.Trigger aria-label="Sort files" class="max-w-48"><ArrowDownWideNarrow /><span class="truncate">{fileSortOptions.find(option => option.value === value)?.label}</span></Select.Trigger>
  <Select.Content>
    {#each fileSortOptions as option}<Select.Item value={option.value} label={option.label} />{/each}
  </Select.Content>
</Select.Root>
