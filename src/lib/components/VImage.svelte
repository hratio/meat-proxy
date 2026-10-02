<script lang="ts" module>
  import type { Picture } from '@sveltejs/enhanced-img';

  // One 192px image covers the largest 95px display at 2x density.
  const artwork = import.meta.glob<Picture>('/src/lib/assets/totems/*.png', {
    eager: true,
    import: 'default',
    query: {
      enhanced: true,
      w: '192',
      format: 'webp',
      quality: 75
    }
  });
</script>

<script lang="ts">
  import { totems, totemIndex, type TotemValue } from '$lib/totems';
  let { index = 0, size = 64, fill = false }: { index?: TotemValue; size?: number; fill?: boolean } = $props();
</script>

<span class="inline-flex shrink-0 items-center justify-center align-middle [&_picture]:contents" class:fill style:width={fill ? '100%' : `${size}px`} style:height={fill ? '100%' : `${size}px`}>
  {#if typeof index === 'string'}
    <span role="img" aria-label={`Totem ${index}`} class="flex size-full items-center justify-center font-sans font-semibold leading-none select-none" style:font-size={fill ? 'min(100cqw, 100cqh)' : `${size * .8}px`}>{index}</span>
  {:else}
    {@const totem = totems[totemIndex(index)]}
    <enhanced:img src={artwork[`/src/lib/assets/totems/${totem.id}.png`]} alt={`${totem.id}: ${totem.name}`}
      class="block size-full object-contain select-none" draggable="false" decoding="async" />
  {/if}
</span>

<style>
  .fill { container-type: size; }
</style>
