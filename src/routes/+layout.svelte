<script lang="ts">
  import '../app.css';
  import '@fontsource-variable/inter';
  import '@fontsource-variable/oxanium';
  import '@fontsource/ibm-plex-mono/400.css';
  import '@fontsource/ibm-plex-mono/500.css';
  import { Toaster } from '$lib/components/ui/sonner';
  import UiProvider from '$lib/components/UiProvider.svelte';
  let { children } = $props();
</script>

<UiProvider>
  {@render children()}
  <Toaster />
</UiProvider>
