<script lang="ts">
  import { onMount } from 'svelte';
  import { timeAgo } from '$lib/time';

  let { value }: { value: string } = $props();
  let now = $state(Date.now());
  // Threads and revision tooltips release their clocks when unmounted.
  onMount(() => {
    const timer = setInterval(() => now = Date.now(), 1000);
    return () => clearInterval(timer);
  });
</script>

<time datetime={value} title={new Date(value).toLocaleString()}>{timeAgo(value, now)}</time>
