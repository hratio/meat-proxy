<script lang="ts">
  import type { Snippet } from 'svelte';
  import { mergeProps } from 'bits-ui';
  import { WrapText } from '@lucide/svelte';
  import Hint from '../Hint.svelte';
  import { wheelCycle } from './wheel-cycle';
  import HudFrame from './HudFrame.svelte';
  import HudIcon from './HudIcon.svelte';
  import CodeExample from './CodeExample.svelte';
  import FittedTitle from './FittedTitle.svelte';
  import type { HudFinding } from './types';
  let { finding, position = 'primary', icon, compact = false, holstered = false, mirrored = false, oncycle, identity = $bindable(), codeExpanded = false, codeControlsVisible = false, wordWrap = false, reducedMotion = false, onwordwrapchange }: {
    finding: HudFinding; position?: 'primary' | 'secondary'; icon?: Snippet; compact?: boolean; holstered?: boolean; mirrored?: boolean; identity?: HTMLDivElement;
    oncycle?: (groups: boolean, direction: number) => void;
    codeExpanded?: boolean; codeControlsVisible?: boolean; wordWrap?: boolean; reducedMotion?: boolean;
    onwordwrapchange?: (enabled: boolean) => void;
  } = $props();
  let wrapAvailable = $derived(codeExpanded && !compact && !holstered && !!finding.example.trim() && !!onwordwrapchange);
</script>

<section class="finding-panel @container/finding h-full min-w-0" style:--finding-color={finding.color} aria-label={`${position} finding: ${finding.group}${holstered ? ' (holstered)' : ''}`}>
  <HudFrame {mirrored}>
    <div class="finding-inner">
      <header class="group-heading flex items-center justify-between gap-2 overflow-hidden" use:wheelCycle={oncycle && (direction => oncycle?.(true, direction))} title={oncycle ? 'Scroll up/down to change group' : undefined}>
        <span class="group-label relative top-px truncate font-(family-name:--hud-font) text-[length:calc(var(--hud-group-size,20px)_-_1px)]/none font-extrabold tracking-[.02em] text-(--finding-label-color) uppercase">{finding.group}</span>
        <Hint text={wordWrap ? 'Disable word wrap' : 'Enable word wrap'} disabled={!wrapAvailable}>
          {#snippet children({ props })}
            <!-- Empty title suppresses the heading's inherited native scroll hint. -->
            <button {...mergeProps(props, { onclick: () => onwordwrapchange?.(!wordWrap) })} type="button" class="wrap-toggle" class:available={wrapAvailable} class:visible={wrapAvailable && codeControlsVisible} class:reduced-motion={reducedMotion}
              aria-label="Wrap code lines" aria-pressed={wordWrap} aria-hidden={!wrapAvailable} tabindex={wrapAvailable ? 0 : -1} disabled={!wrapAvailable} title=""><WrapText size={16} strokeWidth={1.8} /></button>
          {/snippet}
        </Hint>
      </header>
      <div class="code-collapse h-[calc(var(--hud-code-height,142px)+5px*var(--hud-code-reveal,1))] overflow-clip pt-[calc(5px*var(--hud-code-reveal,1))]" inert={compact || holstered} aria-hidden={compact || holstered}>
        <div class="h-[var(--hud-code-height,142px)]">
          <HudFrame variant="inset">
            <div class="absolute inset-x-2 inset-y-1.5 shadow-[inset_0_3px_6px_#0008]">{#if finding.example.trim()}<CodeExample code={finding.example} label={`${finding.code} code example`} {wordWrap} />{:else}<p class="m-0 p-3 font-mono text-[length:var(--hud-code-size,12px)]/[1.55] text-(--tint-819087)">No code example for this rule.</p>{/if}</div>
          </HudFrame>
        </div>
      </div>
      <div class="identity-frame" aria-hidden={holstered} use:wheelCycle={oncycle && (direction => oncycle?.(false, direction))} title={oncycle ? 'Scroll up/down to change weapon / V-code' : undefined}>
        <HudFrame variant="inset">
          <div class="identity grid min-h-[48px] grid-cols-[var(--identity-icon-size)_auto_minmax(0,1fr)] items-center gap-3 pl-[9px] pr-[11px] py-[5px] @max-[330px]/finding:grid-cols-[min(21.6px,var(--identity-icon-size))_auto_minmax(0,1fr)] @max-[330px]/finding:gap-[9px]" bind:this={identity}>
            <div class="identity-icon h-[calc(var(--identity-icon-size)*1.1)] w-[var(--identity-icon-size)] text-(--finding-label-color) @max-[330px]/finding:w-[min(21.6px,var(--identity-icon-size))] [&_svg]:size-full!">{#if icon}{@render icon()}{:else}<HudIcon name={finding.icon} />{/if}</div>
            <strong class="relative top-px font-(family-name:--hud-font) text-[length:var(--identity-vcode-size)]/none font-extrabold tracking-tight text-(--finding-label-color) @max-[330px]/finding:text-[length:min(23.78px,var(--identity-vcode-size))]">{finding.code}</strong>
            <div class="title min-w-0 border-l border-(--tint-a7b39b4a) pl-[13px] font-sans text-[length:var(--hud-title-size,14px)]/[1.3] font-medium text-(--tint-e0e3d8) @max-[330px]/finding:pl-[9px]"><FittedTitle text={finding.title} /></div>
          </div>
        </HudFrame>
      </div>
    </div>
  </HudFrame>
</section>

<style>
  .finding-panel {
    --finding-label-color: color-mix(in srgb, var(--finding-color) 85%, transparent);
    --identity-vcode-size: calc(var(--hud-vcode-size, 34px) * .82);
    --identity-icon-size: calc(var(--hud-icon-size, 29px) * .9);
  }
  .group-label { text-shadow: 0 -1px 1px #000, 0 1px 0 #ffffff14; }
  .wrap-toggle {
    display: grid; place-items: center; flex: 0 0 28px; height: 21px; position: relative; right: 6px; top: -1px; z-index: 1;
    border: 1px solid #ffffff18; border-radius: 3px;
    background: linear-gradient(#ffffff08, #00000030); box-shadow: inset 0 1px #ffffff08, 0 1px 2px #0008;
    color: var(--tint-819087); cursor: pointer;
    opacity: 0; visibility: hidden; transform: translateX(4px) scale(.94); pointer-events: none;
    transition: opacity 140ms ease, transform 180ms cubic-bezier(.16, 1, .3, 1), visibility 0s 180ms, color 140ms ease, border-color 140ms ease;
  }
  .wrap-toggle.visible, .wrap-toggle.available:focus-visible {
    opacity: 1; visibility: visible; transform: none; pointer-events: auto; transition-delay: 0s;
  }
  .wrap-toggle:not(.available) { visibility: hidden; transition: none; }
  .wrap-toggle:hover, .wrap-toggle[aria-pressed='true'] { color: var(--finding-color); border-color: color-mix(in srgb, var(--finding-color) 45%, transparent); }
  .wrap-toggle[aria-pressed='true'] { background: color-mix(in srgb, var(--finding-color) 12%, #111); }
  .wrap-toggle:focus-visible { outline: 1px solid var(--finding-color); outline-offset: 1px; }
  .wrap-toggle.reduced-motion { transition: none; transform: none; }
  @media (prefers-reduced-motion: reduce) { .wrap-toggle { transition: none; transform: none; } }
</style>
