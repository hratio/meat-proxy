<script lang="ts">
  let { children } = $props();
</script>

{@render children()}

<style>
  /* The review stylesheet and web fonts belong to the later DemoReview import. */
  :global(body) { margin: 0; background: #11110f; }
</style>
