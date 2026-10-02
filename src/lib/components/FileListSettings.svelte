<script lang="ts">
  import type { Config } from '$lib/config';
  import { fileSortOptions } from '$lib/file-list';
  import { Switch } from '$lib/components/ui/switch';
  import { Label } from '$lib/components/ui/label';
  import SingleSelect from './SingleSelect.svelte';
  let { display = $bindable() }: { display: Config['display'] } = $props();
  const id = $props.id();
</script>

<div class="my-4 grid gap-4 border-y border-border py-4">
  <div class="flex items-center justify-between gap-4"><Label for={`${id}-icons`}>Show file icons</Label><Switch id={`${id}-icons`} bind:checked={display.showFileIcons} /></div>
  <SingleSelect label="File tree density" value={display.fileTreeDensity} options={[{ value: 'normal', label: 'Normal' }, { value: 'dense', label: 'Dense' }]} onchange={value => display.fileTreeDensity = value as Config['display']['fileTreeDensity']} />
  <SingleSelect label="Default review order" value={display.fileSort} options={[...fileSortOptions]} onchange={value => display.fileSort = value as Config['display']['fileSort']} />
  <div class="flex items-center justify-between gap-4"><Label for={id}>Show completed files</Label><Switch {id} bind:checked={display.showCompletedFiles} /></div>
</div>
