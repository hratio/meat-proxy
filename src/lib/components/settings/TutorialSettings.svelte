<script lang="ts">
  import { onMount } from 'svelte';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import { toast } from '$lib/notifications';
  import { tutorialRestartKey } from '$lib/tutorial/flow';

  let queued = $state(false);
  onMount(() => {
    try { queued = localStorage.getItem(tutorialRestartKey) === 'true'; } catch { /* Report storage failures when the user tries to save. */ }
  });
  function schedule(value: boolean) {
    try {
      if (value) localStorage.setItem(tutorialRestartKey, 'true');
      else localStorage.removeItem(tutorialRestartKey);
      queued = value;
    } catch { toast.error('Could not save tutorial preference. Browser storage is unavailable.'); }
  }
</script>

<div class="grid gap-2">
  <div class="flex items-center justify-between gap-4">
    <Label for="tutorial-next-launch" class="leading-relaxed">Show tutorial on next launch</Label>
    <Switch id="tutorial-next-launch" bind:checked={() => queued, schedule} aria-describedby="tutorial-next-launch-help" />
  </div>
  <p id="tutorial-next-launch-help" class="text-sm leading-relaxed text-muted-foreground">Replay First steps when you reload or reopen the app in this browser. Turns off once the tutorial starts.</p>
</div>
