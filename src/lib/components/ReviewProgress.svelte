<script lang="ts">
  import type { FindingProgress } from '$lib/review-progress';
  import AnimatedNumber from './AnimatedNumber.svelte';
  import ProgressFill from './ProgressFill.svelte';

  let { reviewed, total, findings, reducedMotion = false }: { reviewed: number; total: number; findings: FindingProgress; reducedMotion?: boolean } = $props();
  let done = $derived(Math.max(0, Math.min(reviewed, total)));
  let percent = $derived(total ? done / total * 100 : 0);
  let complete = $derived(total > 0 && done === total);
  let resolvedPercent = $derived(findings.total ? findings.resolved / findings.total * 100 : 0);
</script>

<section class={['review-progress rounded border border-border border-l-2 bg-card px-3.5 pt-2.5 pb-3 mt-0.5 shadow-[0_3px_10px_#0002]', complete ? 'border-l-(--green)' : 'border-l-primary/55']} class:complete aria-label="Review progress">
  <div class="mb-2 flex items-baseline justify-between gap-2 font-sans text-[12px]/[1.25] text-muted-foreground"><span>Files reviewed</span><strong class="font-semibold whitespace-nowrap text-foreground tabular-nums">{done}<span class="font-normal text-muted-foreground"> / {total}</span></strong></div>
  <div class="progress-track h-1.5 rounded-xs bg-muted-foreground/16 shadow-[inset_0_1px_2px_#0005]" role="progressbar" aria-label="Files reviewed" aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={done} aria-valuetext={total ? `${done} of ${total} files reviewed` : 'No files to review'}>
    <ProgressFill {percent} {reducedMotion} class={complete ? 'bg-(--green)' : 'bg-linear-to-r from-primary/65 to-primary'} />
  </div>
  <div class="mt-3 mb-2 flex items-baseline justify-between gap-2 font-sans text-[12px]/[1.25] text-muted-foreground">
    <span>Findings resolved</span>
    <strong class="font-semibold whitespace-nowrap text-warning tabular-nums"><AnimatedNumber value={findings.resolved} {reducedMotion} /><span class="font-normal text-muted-foreground"> / <AnimatedNumber value={findings.total} {reducedMotion} /></span></strong>
  </div>
  <div class="progress-track h-1.5 rounded-xs bg-muted-foreground/16 shadow-[inset_0_1px_2px_#0005]" role="progressbar" aria-label="Findings resolved" aria-valuemin={0} aria-valuemax={Math.max(1, findings.total)} aria-valuenow={findings.resolved} aria-valuetext={findings.total ? `${findings.resolved} of ${findings.total} findings resolved` : 'No findings'}>
    <ProgressFill percent={resolvedPercent} {reducedMotion} class="bg-warning" />
  </div>
</section>
