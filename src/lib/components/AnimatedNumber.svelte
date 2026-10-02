<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Tween, prefersReducedMotion } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  let { value, reducedMotion = false }: { value: number; reducedMotion?: boolean } = $props();
  const counter = new Tween(untrack(() => value), { easing: cubicOut });
  $effect(() => {
    void counter.set(value, {
      duration: reducedMotion || prefersReducedMotion.current ? 0
        : (from, to) => Math.min(2000, 160 + Math.sqrt(Math.abs(to - from)) * 45)
    });
  });
  onMount(() => () => { void counter.set(untrack(() => counter.current), { duration: 0 }); });
</script>

<span class="tabular-nums" aria-label={value.toLocaleString('en-US')}><span aria-hidden="true">{Math.round(counter.current).toLocaleString('en-US')}</span></span>
