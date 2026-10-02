<script lang="ts">
  import type { HudIconName } from './types';
  let { name = 'skull' }: { name?: HudIconName } = $props();
</script>

<svg viewBox="0 0 40 44" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  {#if name === 'skull'}
    <path d="M20 3C9 3 3 10 3 20v8l7 4v7h4v-6h3v8h6v-8h3v6h4v-7l7-4v-8C37 10 31 3 20 3Zm-7 23c-4 0-6-3-6-6l9 2c0 2-1 4-3 4Zm14 0c-2 0-3-2-3-4l9-2c0 3-2 6-6 6Zm-10 4 3-6 3 6Z" fill="currentColor" fill-rule="evenodd" />
  {:else if name === 'shield'}
    <path d="m20 3 15 6v14c0 8-8 14-15 18C13 37 5 31 5 23V9Z" stroke="currentColor" stroke-width="3" />
    <path d="m12 22 5 5 11-12" stroke="currentColor" stroke-width="3" />
  {:else}
    <circle cx="20" cy="22" r="13" stroke="currentColor" stroke-width="3" />
    <circle cx="20" cy="22" r="4" fill="currentColor" />
    <path d="M20 1v10m0 22v10M0 22h10m20 0h10" stroke="currentColor" stroke-width="3" />
  {/if}
</svg>

<style>svg { width: 100%; height: 100%; display: block; }</style>
