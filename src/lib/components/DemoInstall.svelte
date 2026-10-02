<script lang="ts">
  import { prefersReducedMotion } from 'svelte/motion';
  import { Copy } from '@lucide/svelte';
  import { IconButton } from '$lib/components/ui/icon-button';
  import { toast } from '$lib/notifications';
  import ArenaLogo from './ArenaLogo.svelte';

  let { ready, destroyed = false, reducedMotion = false, pulseMs = 3600 }: {
    ready: boolean; destroyed?: boolean; reducedMotion?: boolean; pulseMs?: number;
  } = $props();
  const command = 'npx meat-proxy';
  const id = $props.id();
  const reduced = $derived(reducedMotion || prefersReducedMotion.current);
  let armed = $state(false), revealed = $state(false);
  let input = $state<HTMLInputElement>();

  // Start once the tutorial/arena is ready. Skipping or opening a dialog must
  // not restart the countdown, and unmounting must cancel it.
  $effect(() => { if (ready) armed = true; });
  $effect(() => {
    if (!armed) return;
    const timer = setTimeout(() => revealed = true, 10_000);
    return () => clearTimeout(timer);
  });

  async function copyCommand() {
    try { await navigator.clipboard.writeText(command); return true; }
    catch {
      input?.focus(); input?.select();
      toast.error('Could not copy. The command is selected so you can copy it manually.');
      return false;
    }
  }
</script>

<div class="demo-brand" data-install={revealed} data-reduced-motion={reduced}>
  <div class="logo-window" inert={revealed} aria-hidden={revealed}>
    <div class="logo-art"><ArenaLogo {destroyed} reducedMotion={reduced} /></div>
  </div>
  {#if revealed}
    <div class="install-card" role="group" aria-label="Install Meat Proxy locally" data-cursor="native" data-ui-layer
      style:--install-duration={`${pulseMs}ms`}>
      <div class="install-heading"><label for={id}>Run locally</label><span>... in a git repo/worktree</span></div>
      <div class="install-command">
        <input bind:this={input} {id} value={command} readonly spellcheck={false} autocomplete="off"
          aria-describedby={`${id}-hint`} onfocus={event => event.currentTarget.select()} />
        <IconButton action={copyCommand} successLabel="Install command copied" aria-label="Copy install command" title="Copy install command"
          size="icon-xs" class="h-full w-8 shrink-0 rounded-l-none rounded-r-sm border-l border-border/80 text-primary hover:bg-primary/15 hover:text-primary"><Copy class="size-3.5" /></IconButton>
      </div>
      <span class="sr-only" id={`${id}-hint`}>Run this command in a terminal from your Git repository.</span>
    </div>
  {/if}
</div>

<style>
  @property --install-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
  .demo-brand { position: relative; width: 100%; height: 55px; container-type: inline-size; }
  .logo-window { position: absolute; inset: -8px -8px; }
  [data-install='true'] .logo-window { overflow: hidden; }
  .logo-art { display: flex; align-items: center; justify-content: center; height: 100%; }
  [data-install='true'] .logo-art { animation: logo-depart 480ms cubic-bezier(.4, 0, .8, .4) both; }
  .install-card {
    position: relative; display: flex; flex-direction: column; gap: 4px; height: 55px; padding: 6px 9px;
    pointer-events: auto; border: 1px solid transparent; border-radius: 7px;
    background: linear-gradient(var(--secondary), var(--card)) padding-box,
      conic-gradient(from var(--install-angle), var(--border), var(--success), var(--warning), var(--success), var(--border) 60%) border-box;
    box-shadow: 0 4px 20px #0006;
    animation: install-arrive 420ms 220ms ease-out both, install-border var(--install-duration) linear infinite, install-glow var(--install-duration) ease-in-out infinite;
  }
  .install-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font: 9px/10px var(--mono); white-space: nowrap; }
  .install-heading label { color: var(--primary); text-transform: uppercase; letter-spacing: .12em; }
  .install-heading span { color: var(--muted-foreground); font-size: 8px; }
  .install-command { display: flex; min-width: 0; flex: 1; overflow: hidden; border: 1px solid var(--border); border-radius: 3px; background: #0003; }
  input { width: 100%; min-width: 0; padding: 0 8px; border: 0; background: transparent; color: var(--foreground); font: 500 clamp(11px, calc(12cqw - 9px), 18px)/1 var(--mono); outline: none; user-select: text; cursor: text !important; }
  input::selection { color: var(--primary-foreground); background: var(--primary); }
  .install-command:focus-within { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
  [data-reduced-motion='true'] .install-card { animation: none; }
  [data-reduced-motion='true'][data-install='true'] .logo-art { visibility: hidden; animation: none; }
  @container (max-width: 250px) { .install-heading span { display: none; } }
  @keyframes logo-depart { to { opacity: 0; transform: translateX(110%) rotateY(35deg); visibility: hidden; } }
  @keyframes install-arrive { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }
  @keyframes install-border { to { --install-angle: 360deg; } }
  @keyframes install-glow { 50% { box-shadow: 0 4px 20px #0008, 0 0 18px color-mix(in srgb, var(--success) 25%, transparent); } }
</style>
