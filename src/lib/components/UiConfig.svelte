<script lang="ts">
  import type { Config } from '$lib/config';
  import { useUi } from '$lib/ui/context.svelte';

  let { config }: { config: Config } = $props();
  const ui = useUi();
  $effect(() => {
    ui.config = config;
    // Keep the last saved palette when navigating to a route without config.
    ui.rememberedTheme = config.display.shellTheme;
    ui.rememberedColors = { customColors: config.display.customColors, baseTint: config.display.baseTint, accent: config.display.accent };
    return () => { ui.config = undefined; };
  });
</script>
