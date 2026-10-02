<script lang="ts">
  import Layout from '../src/routes/+layout.svelte';
  import Arena from '../src/routes/+page.svelte';
  import type { StartupHandoff } from '../src/lib/startup-handoff';
  let { startup }: { startup: StartupHandoff } = $props();
</script>

<Layout><Arena {startup} /></Layout>
