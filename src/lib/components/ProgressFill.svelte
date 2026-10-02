<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { cn } from '$lib/utils';

  let { percent, reducedMotion = false, direction = 'increase', class: className }: { percent: number; reducedMotion?: boolean; direction?: 'increase' | 'decrease'; class?: string } = $props();
  let value = $derived(Math.max(0, Math.min(100, percent)));
  let quiet = $derived(reducedMotion || prefersReducedMotion.current);
  let active = $state(false);
  let previous = untrack(() => value);
  let idle: ReturnType<typeof setTimeout>;
  const sparks = [
    { x: '6px', y: '-5px', delay: '-90ms', duration: '570ms' },
    { x: '8px', y: '3px', delay: '-320ms', duration: '680ms' },
    { x: '-4px', y: '-6px', delay: '-460ms', duration: '730ms' },
    { x: '4px', y: '6px', delay: '-210ms', duration: '610ms' }
  ];

  $effect(() => {
    const next = value;
    const change = (next - previous) * (direction === 'decrease' ? -1 : 1);
    if (quiet || change < 0) {
      clearTimeout(idle);
      active = false;
    } else if (change > 0) {
      // Extend the active window without replacing the fill or restarting
      // its sheen. CSS retargets the width from its current visual position.
      active = true;
      clearTimeout(idle);
      idle = setTimeout(() => active = false, 800);
    }
    previous = next;
  });
  onDestroy(() => clearTimeout(idle));
</script>

<div class={cn('progress-fill group/progress relative h-full rounded-[inherit] transition-[width] duration-700 ease-out data-[quiet=true]:transition-none motion-reduce:transition-none', className)}
  style:width={`${value}%`} data-active={active} data-quiet={quiet} data-direction={direction}>
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-350 ease-out group-data-[active=true]/progress:opacity-100 group-data-[active=true]/progress:duration-150 group-data-[quiet=true]/progress:hidden motion-reduce:hidden">
    <div class="absolute inset-0 rounded-[inherit] bg-linear-to-r from-transparent via-white/25 to-transparent bg-size-[200%_100%] animate-[review-progress-flow_1.4s_linear_infinite] [animation-play-state:paused] group-data-[direction=decrease]/progress:[animation-direction:reverse] group-data-[active=true]/progress:[animation-play-state:running] group-data-[quiet=true]/progress:animate-none motion-reduce:animate-none"></div>
    <div class="absolute inset-y-0 right-0 w-1.5 max-w-full rounded-[inherit] bg-linear-to-l from-white/75 via-white/20 to-transparent shadow-[0_0_6px_1px_var(--progress-glow,var(--primary))] animate-[review-progress-tip_470ms_linear_infinite] [animation-play-state:paused] group-data-[active=true]/progress:[animation-play-state:running] group-data-[quiet=true]/progress:animate-none motion-reduce:animate-none"></div>
    <div class="absolute top-1/2 right-0 size-0">
      {#each sparks as spark}
        <span class="absolute -top-px -left-px size-0.5 rounded-full bg-white/90 shadow-[0_0_2px_#fff8] opacity-0 animate-[review-progress-spark_var(--spark-duration)_ease-out_infinite] [animation-delay:var(--spark-delay)] [animation-play-state:paused] group-data-[active=true]/progress:[animation-play-state:running] group-data-[quiet=true]/progress:animate-none motion-reduce:animate-none"
          style:--spark-x={direction === 'decrease' ? `calc(${spark.x} * -1)` : spark.x} style:--spark-y={spark.y} style:--spark-delay={spark.delay} style:--spark-duration={spark.duration}></span>
      {/each}
    </div>
  </div>
</div>

<style>
  @keyframes -global-review-progress-flow {
    from { background-position: 200% 0; }
    to { background-position: 0% 0; }
  }
  @keyframes -global-review-progress-tip {
    0%, 100% { opacity: .8; }
    18%, 48%, 76% { opacity: 1; }
    32%, 62% { opacity: .65; }
  }
  @keyframes -global-review-progress-spark {
    0%, 12% { opacity: 0; transform: translate(0, 0) scale(.65); }
    22% { opacity: .85; transform: translate(calc(var(--spark-x) * .2), calc(var(--spark-y) * .2)) scale(1); }
    68% { opacity: .55; transform: translate(calc(var(--spark-x) * .8), calc(var(--spark-y) * .8)) scale(.7); }
    88%, 100% { opacity: 0; transform: translate(var(--spark-x), var(--spark-y)) scale(.25); }
  }
</style>
