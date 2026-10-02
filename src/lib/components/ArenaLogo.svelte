<script lang="ts" module>
  import meat from '$lib/assets/logo/meat.webp';
  import head from '$lib/assets/logo/head.webp';
  import proxy from '$lib/assets/logo/proxy.webp';
  // Splash baking supplies graded, compressed parts at 2x display size.
  const artwork = { meat, head, proxy };
  const parts = ['meat', 'head', 'proxy'] as const;
</script>

<script lang="ts">
  let { destroyed = false, reducedMotion = false }: { destroyed?: boolean; reducedMotion?: boolean } = $props();
  let gone = $state(false);
  $effect(() => { if (!destroyed) gone = false; });
</script>

<div class="arena-logo group/logo pointer-events-auto flex h-[55px] aspect-[4.65] items-center justify-center animate-[arena-settle_650ms_1400ms_both] data-[destroyed=true]:pointer-events-none data-[destroyed=true]:animate-none data-[destroyed=true]:opacity-75 data-[destroyed=true]:grayscale data-[still=true]:animate-none data-[still=true]:opacity-75 data-[still=true]:grayscale data-[gone=true]:invisible data-[still=true]:data-[destroyed=true]:invisible motion-reduce:animate-none motion-reduce:opacity-75 motion-reduce:grayscale motion-reduce:data-[destroyed=true]:invisible"
  data-destroyed={destroyed} data-still={reducedMotion} data-gone={gone}
  data-shoot-logo={!destroyed ? '' : undefined} role="img" aria-label="Meat Proxy" aria-hidden={gone}
  onanimationend={event => { if (event.animationName.includes('shatter')) gone = true; }}>
  {#each parts as part}
    <span class={['pointer-events-none block flex-none [&_img]:block [&_img]:size-full [&_img]:object-contain [&_img]:select-none group-data-[destroyed=true]/logo:animate-[arena-shatter_600ms_ease-in_both] group-data-[still=true]/logo:animate-none motion-reduce:animate-none',
      part === 'head' ? 'z-1 h-full w-1/5 animate-[arena-drop_700ms_both] [--break-x:8%] [--break-y:-140%] [--break-turn:30deg]' :
      part === 'meat' ? 'h-[58%] w-[35%] translate-x-[8px] animate-[arena-enter-left_550ms_550ms_both] [--break-x:-110%] [--break-y:100%] [--break-turn:-65deg]' :
      'h-[58%] w-[42%] -translate-x-[4px] animate-[arena-enter-right_550ms_550ms_both] [--break-x:110%] [--break-y:100%] [--break-turn:65deg]']}>
      <img src={artwork[part]} alt="" draggable="false" loading="eager" />
    </span>
  {/each}
</div>

<style>
  @keyframes -global-arena-drop { 0% { transform: translateY(-130%); opacity: 0; } 55% { transform: translateY(10%); opacity: 1; } 75% { transform: translateY(-9%); } 90% { transform: translateY(3%); } 100% { transform: none; } }
  @keyframes -global-arena-enter-left { from { transform: translateX(-100%); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes -global-arena-enter-right { from { transform: translateX(100%); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes -global-arena-settle { from { opacity: 1; filter: grayscale(0); } to { opacity: .75; filter: grayscale(1); } }
  @keyframes -global-arena-shatter { to { transform: translate(var(--break-x), var(--break-y)) rotate(var(--break-turn)); opacity: 0; } }
</style>
