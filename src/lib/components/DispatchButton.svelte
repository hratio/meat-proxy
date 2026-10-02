<script lang="ts">
  import { Clock, Send } from '@lucide/svelte';
  import type { Config } from '$lib/config';
  import type { DispatchSummary } from '$lib/dispatch';
  import { Button } from '$lib/components/ui/button';
  import Hint from './Hint.svelte';

  let { summary, sent, complete, finished, pending, disabled, config, onclick }: {
    summary: DispatchSummary; sent: number; complete: boolean; finished: boolean; pending: boolean; disabled: boolean; config: Config; onclick: () => void;
  } = $props();
  let ready = $derived(summary.findings > 0 || complete && !finished);
  let label = $derived(pending ? (summary.findings ? 'Dispatching…' : 'Completing…')
    : summary.findings ? `Dispatch ${summary.findings.toLocaleString('en-US')} finding${summary.findings === 1 ? '' : 's'}`
    : complete ? finished ? 'Review complete' : 'Complete review' : 'Dispatch');
  let sentLabel = $derived(sent.toLocaleString('en-US'));
  let heldLabel = $derived(summary.held.toLocaleString('en-US'));
</script>

<div class="dispatch-actions pointer-events-auto flex w-full shrink-0 rounded-lg shadow-[0_5px_24px_#0008]" data-cursor="native">
  <Button variant="outline" size="lg" class="dispatch-button h-auto min-h-[46px] min-w-0 flex-1 shrink rounded-r-none gap-2.5 px-4.5 py-2.5 font-semibold disabled:opacity-100 disabled:[&>svg]:opacity-50 disabled:[&>span]:opacity-50 data-[celebrate=true]:border-transparent data-[celebrate=true]:[background:linear-gradient(var(--secondary),var(--card))_padding-box,conic-gradient(from_var(--dispatch-angle),var(--border),var(--success),var(--warning),var(--success),var(--border)_60%)_border-box] data-[celebrate=true]:animate-[dispatch-border_var(--dispatch-duration)_linear_infinite,dispatch-glow_var(--dispatch-duration)_ease-in-out_infinite] data-[reduced-motion=true]:animate-none disabled:animate-none motion-reduce:animate-none"
    data-celebrate={config.experience.mode === 'game' && complete && ready && !pending && !disabled} data-reduced-motion={config.display.reducedMotion}
    style={`--dispatch-duration: ${config.display.dispatchPulseMs}ms`} aria-busy={pending || disabled} disabled={disabled || !ready} {onclick}>
    <Send class="size-[18px]" />
    <span class="min-w-0 whitespace-normal text-center leading-tight">{label}</span>
  </Button>
  <div class="grid shrink-0 grid-rows-2 rounded-r-lg border border-l-0 border-border bg-background text-muted-foreground/80 dark:border-input dark:bg-input/30" role="group" aria-label="Dispatch status" data-dispatch-counts>
    <Hint text={`${sentLabel} sent`}>
      {#snippet children({ props })}
        <button {...props} type="button" aria-label={`${sentLabel} sent`} class="grid min-w-14 grid-cols-[12px_1fr] items-center gap-x-1.5 rounded-tr-lg border-b border-border px-2 py-0.5 text-[11px] leading-none tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:border-input" data-ui-control data-dispatch-sent>
          <Send class="size-3" aria-hidden="true" /><span class="text-right">{sentLabel}</span>
        </button>
      {/snippet}
    </Hint>
    <Hint text="Awaiting file review. Mark their files reviewed to include these findings in the next dispatch.">
      {#snippet children({ props })}
        <button {...props} type="button" aria-label={`${heldLabel} awaiting file review`} class="grid min-w-14 grid-cols-[12px_1fr] items-center gap-x-1.5 rounded-br-lg px-2 py-0.5 text-[11px] leading-none tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" data-ui-control data-dispatch-held>
          <Clock class="size-3" aria-hidden="true" /><span class="text-right">{heldLabel}</span>
        </button>
      {/snippet}
    </Hint>
  </div>
</div>

<style>
  @property --dispatch-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
  @keyframes -global-dispatch-border { to { --dispatch-angle: 360deg; } }
  @keyframes -global-dispatch-glow { 50% { box-shadow: 0 4px 24px #0008, 0 0 22px --alpha(var(--game-success) / 30%); } }
</style>
