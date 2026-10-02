<script lang="ts">
  import { isDemo, reviewFetch } from '$review-client';
  import { Copy, SquareCode } from '@lucide/svelte';
  import type { Config } from '$lib/config';
  import { toast } from '$lib/notifications';
  import { IconButton } from '$lib/components/ui/icon-button';
  import Hint from './Hint.svelte';

  let { path, editorPath = path, reviewId, config }: { path: string; editorPath?: string; reviewId: string; config: Config } = $props();
  const editorLabel = $derived(config.editor.executable ? 'Open in editor' : 'Open in VS Code');

  async function copyPath() {
    try { await navigator.clipboard.writeText(path); return true; }
    catch { toast.error('Could not copy the path.'); return false; }
  }
  async function openEditor() {
    try {
      const response = await reviewFetch('/api/open-editor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewId, path: editorPath }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not open the editor.');
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not open the editor.'); return false; }
  }
</script>

<Hint text="Copy file path">
  {#snippet children({ props })}
    <IconButton {...props} action={copyPath} successLabel="Path copied" size="icon-xs" class="file-copy size-[var(--file-copy-size,1.75rem)]" aria-label={`Copy path ${path}`}><Copy class="size-[var(--header-icon-size,14px)]" /></IconButton>
  {/snippet}
</Hint>
{#if config.editor.enabled && !isDemo}
  <Hint text={`${editorLabel} · current file on disk`}>
    {#snippet children({ props })}
      <IconButton {...props} action={openEditor} successLabel="Opened in editor" size="icon-xs" class="file-editor size-[var(--file-copy-size,1.75rem)]" aria-label={`${editorLabel}: ${path}`}><SquareCode class="size-[var(--header-icon-size,14px)]" /></IconButton>
    {/snippet}
  </Hint>
{/if}
