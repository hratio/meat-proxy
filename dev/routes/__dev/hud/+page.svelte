<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Input } from '$lib/components/ui/input';
  import SingleSelect from '$lib/components/SingleSelect.svelte';
  import ShellThemePicker from '$lib/components/settings/ShellThemePicker.svelte';
  import TargetPicker from '$lib/components/settings/TargetPicker.svelte';
  import CombatHud from '$lib/components/hud/CombatHud.svelte';
  import HudControls from '$lib/components/hud/HudControls.svelte';
  import HudAvatar from '$lib/components/HudAvatar.svelte';
  import { defaults } from '$lib/config';
  import { demoFindings, type HudDisplayMode } from '$lib/components/hud/types';
  import { expressionNames, type AvatarRequest } from '$lib/avatar/playback';
  import { useUi } from '$lib/ui/context.svelte';

  const ui = useUi();
  let settings = $state({ ...defaults.hud });
  let target = $state(defaults.targets.artwork);
  let findings = $state(structuredClone(demoFindings));
  let mode = $state<HudDisplayMode>('detailed');
  let exploded = $state(false), wireframe = $state(false);
  let tab = $state('assembly');
  let expression = $state<AvatarRequest['expression']>('Idle');
  let avatarRequest = $state<AvatarRequest>();
  let hudWidth = $state(0), hudHeight = $state(0);
  const previewConfig = $derived({ ...defaults, hud: settings, targets: { ...defaults.targets, artwork: target } });
  $effect(() => { ui.previewHudTint = settings.tintStrength; });
  onDestroy(() => { ui.previewHudTint = undefined; ui.previewTheme = undefined; ui.previewColors = undefined; });

  const sections = [
    { value: 'assembly', label: 'Assembly' }, { value: 'lettering', label: 'Code & lettering' },
    { value: 'portrait', label: 'Portrait' }, { value: 'surface', label: 'Theme & surface' },
    { value: 'content', label: 'Finding content' }, { value: 'targets', label: 'Shooting targets' }
  ];
  function reset() {
    settings = { ...defaults.hud }; findings = structuredClone(demoFindings);
    mode = 'detailed'; exploded = false; wireframe = false; target = defaults.targets.artwork;
    ui.previewTheme = undefined; ui.previewColors = undefined;
  }
  function exportSetup() {
    const data = { hud: $state.snapshot(settings), targets: { artwork: target }, findings: $state.snapshot(findings) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'meat-proxy-hud.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<svelte:head><title>HUD workbench · Meat Proxy</title></svelte:head>

<main class="mx-auto min-h-dvh max-w-[1920px] space-y-6 p-6 text-foreground">
  <header class="flex flex-wrap items-center justify-between gap-4">
    <div><a href="/" class="text-sm text-muted-foreground">← Back to arena</a><h1 class="mt-3 text-2xl font-semibold">HUD workbench</h1><p class="mt-1 text-sm text-muted-foreground">Blade Runner production assets. Preview changes stay in this workbench.</p></div>
    <div class="flex gap-2"><Button variant="outline" onclick={reset}>Reset preview</Button><Button variant="outline" onclick={exportSetup}>Export setup</Button></div>
  </header>
  <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <section class="min-w-0 overflow-hidden rounded-lg border border-border" aria-label="HUD preview">
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card p-3">
        <div class="flex gap-1" role="group" aria-label="Weapon display mode">
          {#each ['detailed', 'compact'] as view}<Button variant={mode === view ? 'secondary' : 'ghost'} aria-pressed={mode === view} onclick={() => mode = view as HudDisplayMode}>{view === 'detailed' ? 'Detailed' : 'Compact'}</Button>{/each}
        </div>
        <div class="flex gap-5 text-sm"><label class="flex items-center gap-2"><Switch bind:checked={exploded} />Exploded</label><label class="flex items-center gap-2"><Switch bind:checked={wireframe} />Wireframe</label></div>
      </div>
      <div class="preview-stage relative flex min-h-[480px] items-end overflow-auto bg-[#0a1715] px-5 pt-28 pb-12">
        <div class="w-full">
          <p class="mb-6 text-center font-mono text-[10px] text-[#87978f]">{Math.round(hudWidth)} × {Math.round(hudHeight)} PX</p>
          <div class="hud-measure mx-auto w-full" style:max-width={settings.width + 'px'} bind:clientWidth={hudWidth} bind:clientHeight={hudHeight}>
            <CombatHud {settings} {mode} {exploded} {wireframe} left={findings[0]} right={findings[1]}>
              {#snippet portrait()}<HudAvatar request={avatarRequest} framing={{ zoom: 1.2, offsetXPx: 0, offsetYPx: 0 }} effectsEnabled={false} quality={{ fps: 30, renderScale: 2 }} />{/snippet}
            </CombatHud>
          </div>
        </div>
      </div>
    </section>
    <aside class="@container min-w-0 rounded-lg border border-border bg-card p-5">
      <SingleSelect label="Preview controls" value={tab} options={sections} onchange={value => tab = value} />
      <div class="mt-5">
        {#if tab === 'surface'}
          <ShellThemePicker bind:value={() => ui.theme, theme => { ui.previewTheme = theme; ui.previewColors = { customColors: false }; }} />
        {/if}
        {#if tab === 'targets'}
          <TargetPicker bind:value={target} config={previewConfig} />
        {:else if tab === 'content'}
          {#each findings as finding, index}
            <fieldset class="mb-6 grid gap-3"><legend class="mb-3 text-sm font-medium">{index === 0 ? 'Left' : 'Right'} finding</legend>
              <label class="grid gap-1 text-sm">Group<Input bind:value={finding.group} /></label>
              <label class="grid gap-1 text-sm">V-code<Input bind:value={finding.code} /></label>
              <label class="grid gap-1 text-sm">Title<Input bind:value={finding.title} /></label>
              <label class="grid gap-1 text-sm">Color<Input type="color" bind:value={finding.color} /></label>
              <label class="grid gap-1 text-sm">Code example<Textarea rows={7} spellcheck={false} bind:value={finding.example} /></label>
            </fieldset>
          {/each}
        {:else}
          <HudControls value={settings} onchange={value => settings = value} section={tab} />
          {#if tab === 'portrait'}<SingleSelect label="Expression" value={expression} options={expressionNames.map(value => ({ value, label: value }))} onchange={value => { expression = value as AvatarRequest['expression']; avatarRequest = { expression, policy: 'interrupt' }; }} />{/if}
        {/if}
      </div>
    </aside>
  </div>
</main>
