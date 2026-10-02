<script lang="ts">
  import { tick } from 'svelte';
  import { Blend, ChevronDown, GitCompareArrows, Radio, ArrowRight, Files } from '@lucide/svelte';
  import type { ReviewView } from '$lib/file-section-state';
  import { Button } from '$lib/components/ui/button';
  import * as Popover from '$lib/components/ui/popover';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import * as Tooltip from '$lib/components/ui/tooltip';

  let { value, overrides, helpDelay = 400, onchange }: { value: ReviewView; overrides: number; helpDelay?: number; onchange: (value: ReviewView) => void } = $props();
  let open = $state(false);
  let selection = $state('latest');
  $effect(() => { selection = value; });
  function select(next: string) {
    if (next === 'latest' || next === 'head') onchange(next);
    else void tick().then(() => selection = value);
  }
  const options = [
    { value: 'latest', label: 'Current round', icon: Radio, baseline: 'Round baseline', description: 'Changes since the previous completed round. The first round starts at HEAD; each new round starts from the version you reviewed.' },
    { value: 'head', label: 'Since HEAD', icon: GitCompareArrows, baseline: 'Git HEAD', description: 'The full diff against HEAD, including changes from earlier review rounds. Reviewing a file does not move this baseline.' }
  ] as const;
</script>

<div class="flex shrink-0 items-center gap-2" role="group" aria-label="Comparison for all files">
  <span class="text-xs text-muted-foreground @max-[1150px]/toolbar:hidden">Compare</span>
  {#if overrides}
    <Popover.Root bind:open>
      <Popover.Trigger>
        {#snippet child({ props })}<Button {...props} variant="secondary" aria-label={`Mixed comparisons: ${overrides} file${overrides === 1 ? '' : 's'} overridden`}><Blend />Mixed<span class="rounded bg-background/60 px-1.5 text-xs tabular-nums">{overrides}</span><ChevronDown class="size-3.5" /></Button>{/snippet}
      </Popover.Trigger>
      <Popover.Content variant="panel" align="start" sideOffset={10} class="w-72 gap-3 p-3" aria-label="Mixed comparisons">
        <p class="px-1 text-xs text-muted-foreground">{overrides} file{overrides === 1 ? '' : 's'} overridden</p>
        <div class="grid gap-1 border-t border-border pt-3">
          <p class="mb-1 px-2 text-xs font-medium text-muted-foreground">Apply to all files</p>
          {#each options as option}
            <Button variant="ghost" class="justify-start gap-2.5" onclick={() => { open = false; onchange(option.value); }}><option.icon />{option.label}</Button>
          {/each}
        </div>
      </Popover.Content>
    </Popover.Root>
  {:else}
    <ToggleGroup.Root type="single" variant="outline" bind:value={selection} onValueChange={select} class="bg-background/40" aria-label="Set comparison for all files">
      {#each options as option}
        <Tooltip.Root delayDuration={helpDelay}>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <ToggleGroup.Item {...props} value={option.value}
                data-state={selection === option.value ? 'on' : 'off'} class="text-xs text-muted-foreground data-[state=on]:text-foreground">{option.label}</ToggleGroup.Item>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="bottom" align="start" sideOffset={10} class="w-[min(340px,calc(100vw-24px))] max-w-none flex-col items-stretch gap-3 rounded-lg p-4 text-sm shadow-xl" arrowClasses="hidden" aria-label={`About ${option.label}`} data-cursor="native">
            <header class="flex items-center gap-2.5"><option.icon class="size-4 text-muted-foreground" /><span class="font-medium">{option.label}</span></header>
            <div class="flex items-center justify-between gap-2 rounded-md border border-border bg-background/50 px-3 py-2.5 text-xs">
              <span>{option.baseline}</span><ArrowRight class="size-3.5 shrink-0 text-muted-foreground" /><span>Current file</span>
            </div>
            <p class="text-xs leading-relaxed text-muted-foreground">{option.description}</p>
            <footer class="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground"><Files class="size-3.5" />All files · Follows current edits</footer>
          </Tooltip.Content>
        </Tooltip.Root>
      {/each}
    </ToggleGroup.Root>
  {/if}
</div>
