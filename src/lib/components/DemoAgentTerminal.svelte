<script lang="ts">
  import { prefersReducedMotion } from 'svelte/motion';
  import { Check, Terminal, LoaderCircle } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';

  let { count, paths, running, result, error, reducedMotion = false, transcriptReady = $bindable(false), onreview, onretry }: {
    count: number; paths: string[]; running: boolean; result?: { resolved: number; changed: number }; error?: string;
    reducedMotion?: boolean; transcriptReady?: boolean; onreview: () => void; onretry: () => void;
  } = $props();
  const reduced = $derived(reducedMotion || prefersReducedMotion.current);
  const lines = $derived([
    '$ agent review --from-outbox',
    `Loaded ${count} finding${count === 1 ? '' : 's'} + review rules`,
    ...paths.slice(0, 3).map(path => `read › ${path}`),
    ...(paths.length > 3 ? [`read › …and ${paths.length - 3} more files`] : []),
    'Thinking. Confidence: suspiciously high.',
    'Applying demo amendments and preparing replies…'
  ]);
  let shown = $state(1);
  const finished = $derived(shown >= lines.length);
  $effect(() => { transcriptReady = finished; });
  $effect(() => {
    const count = lines.length;
    if (reduced) { shown = count; return; }
    const timer = setInterval(() => { shown = Math.min(count, shown + 1); if (shown === count) clearInterval(timer); }, 460);
    return () => clearInterval(timer);
  });
</script>

<section class="agent-terminal" data-tutorial="agent-terminal" aria-label="Simulated agent terminal">
  <header><span><Terminal size={14} /> SIMULATED AGENT</span><small>PLAYGROUND</small></header>
  <div class="agent-log" role="log" aria-live="polite" aria-relevant="additions">
    {#each lines.slice(0, shown) as line}<p>{line}</p>{/each}
    {#if error}<p class="agent-error">Stopped: {error}</p>
    {:else if result && finished}<p class="agent-success">✓ {result.changed} file{result.changed === 1 ? '' : 's'} changed · {result.resolved} finding{result.resolved === 1 ? '' : 's'} resolved</p>
    {:else}<span class="agent-cursor" class:still={reduced} aria-hidden="true">▌</span>{/if}
  </div>
  <footer>
    <p role="status">{#if error}The run didn’t finish.{:else if result && finished}<Check size={14} />Done. Your turn.{:else}<LoaderCircle size={14} class={reduced ? '' : 'animate-spin'} />Working through the review…{/if}</p>
    {#if error}<Button variant="outline" data-tutorial="agent-run" onclick={onretry} disabled={running}>Retry agent</Button>
    {:else}<Button data-tutorial="agent-review" onclick={onreview} disabled={running || !result || !finished}>Review changes</Button>{/if}
  </footer>
</section>

<style>
  .agent-terminal { overflow: hidden; border: 1px solid #93b58244; border-radius: 8px; background: #09100c; color: #c0d1b9; }
  header { display: flex; justify-content: space-between; gap: 16px; padding: 12px 15px; border-bottom: 1px solid #93b58222; background: #93b58209; font: 10px/1.4 var(--mono); letter-spacing: .08em; }
  header span { display: flex; align-items: center; gap: 8px; color: #b5d99f; }
  header small { color: #93a38b; font-size: 9px; }
  .agent-log { min-height: 180px; padding: 15px; font: 11px/1.9 var(--mono); overflow-wrap: anywhere; }
  .agent-log p { margin: 0; }
  .agent-log p:first-child { color: #eac078; margin-bottom: 8px; }
  .agent-log .agent-success { margin-top: 10px; color: #b5d99f; }
  .agent-log .agent-error { margin-top: 10px; color: #ffb0a0; }
  .agent-cursor { color: #b5d99f; animation: blink 900ms step-end infinite; }
  .agent-cursor.still { animation: none; }
  footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 12px 15px; border-top: 1px solid #93b58222; }
  footer p { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 11px; }
  @keyframes blink { 50% { opacity: 0; } }
</style>
