<script lang="ts">
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import { prefersReducedMotion } from 'svelte/motion';
  import { ArrowLeft, ArrowUpRight, Check, Download, Expand, Eye, EyeOff, Mountain, Pause, Play, Redo2, RotateCcw, Save, Search, Shuffle, Undo2, Upload, X, Zap } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Slider } from '$lib/components/ui/slider';
  import { Switch } from '$lib/components/ui/switch';
  import SplashLandscape from '$lib/components/splash/SplashLandscape.svelte';
  import SplashScreen from '$lib/components/splash/Splash2Screen.svelte';
  import { defaultSplashConfig } from '$lib/components/splash/config';
  import { landscapeDefaults, landscapeSchema, type LandscapeConfig, type LightningCue } from '$lib/components/splash/landscape-config';
  import { describeLandscapeField, editLandscapeField, landscapeGroups, readLandscapeField, type LandscapePath, type LandscapeValue } from '$workbench/landscape-controls';
  import { lightningWaterPoint } from '$lib/components/splash/lightning-placement';
  import { sequenceShots } from '$lib/components/splash/sequence-math';
  import { landscapePresets } from '$workbench/landscape-presets';
  import CameraPan from '$workbench/CameraPan.svelte';
  import LightningCues from '$workbench/LightningCues.svelte';
  import TimelineScrubber from '$workbench/TimelineScrubber.svelte';
  import SequenceEditor from '$workbench/SequenceEditor.svelte';

  let config = $state<LandscapeConfig>(structuredClone(defaultSplashConfig.landscape));
  let saved = $state<LandscapeConfig>(structuredClone(defaultSplashConfig.landscape));
  let group = $state<string>('city'), search = $state(''), paused = $state(false), artwork = $state(false);
  let loading = $state(dev), saving = $state(false), canSave = $state(false), error = $state(false), message = $state('');
  let lightningCue = $state(0);
  let previewTimeMs = $state(0), placingCue = $state<number>();
  let sequenceEndMs = $derived(sequenceShots(config).at(-1)!.end * 1000);
  let timelineEnd = $derived(Math.max(30000, sequenceEndMs, ...config.lightning.cues.map(cue => cue.timeMs + config.lightning.duration * 1050), previewTimeMs));
  let workspace = $state<'landscape' | 'camera' | 'sequence'>('landscape'), cameraOpened = $state(false), sequenceOpened = $state(false);
  let status = $state<'loading' | 'ready' | 'fallback'>('loading');
  let stats = $state({ calls: 0, triangles: 0, geometries: 0, textures: 0 });
  let history = $state<LandscapeConfig[]>([]), future = $state<LandscapeConfig[]>([]);
  let lastEdit = '', lastEditAt = 0;
  let stage = $state<HTMLDivElement>(), upload: HTMLInputElement;
  let replay = $state(false), titleTime = $state(0), replayStart = $state(0), fadePhase = $state<'in' | 'hold' | 'out' | 'done'>('done');
  let replayFrame = 0;
  let dirty = $derived(JSON.stringify(config) !== JSON.stringify(saved));
  let visibleGroups = $derived(landscapeGroups.filter(item => search.trim() || item.id === group).map(item => ({ ...item,
    fields: item.fields.filter(field => !search.trim() || `${field.label} ${item.name}`.toLowerCase().includes(search.trim().toLowerCase()))
  })).filter(item => item.fields.length));
  let activePreset = $derived(landscapePresets.find(preset => JSON.stringify(preset.settings) === JSON.stringify(config))?.name);
  $effect(() => { if (placingCue !== undefined && !config.lightning.cues.some(cue => cue.timeMs === placingCue)) placingCue = undefined; });

  function notify(text: string, failed = false) { message = text; error = failed; }
  function change(next: LandscapeConfig, source = '') {
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    const now = performance.now();
    if (!source || source !== lastEdit || now - lastEditAt > 500) history = [...history.slice(-49), $state.snapshot(config)];
    lastEdit = source; lastEditAt = now; future = []; config = next;
    message = '';
  }
  function edit(path: LandscapePath, value: LandscapeValue) { change(editLandscapeField($state.snapshot(config), path, value), path); }
  function setCues(cues: LightningCue[]) {
    const next = editLandscapeField($state.snapshot(config), 'lightning.cues', cues);
    if (cues.length > config.lightning.cues.length && next.lightning.timing === 'automatic') next.lightning.timing = 'scheduled';
    change(next, 'lightning.cues');
  }
  function seek(value: number) {
    if (!Number.isFinite(value)) return;
    stopReplay(); paused = true; lightningCue = 0;
    previewTimeMs = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(value)));
  }
  function place(cue: LightningCue) { seek(cue.timeMs + config.lightning.duration * 112); placingCue = cue.timeMs; }
  function pickWater(event: MouseEvent) {
    if (placingCue === undefined || !stage) return;
    const box = stage.getBoundingClientRect();
    const point = lightningWaterPoint((event.clientX-box.left)/box.width*2-1, 1-(event.clientY-box.top)/box.height*2,
      box.width/box.height, previewTimeMs, placingCue, config);
    if (!point) { notify('Click the foreground water to choose an impact point.', true); return; }
    setCues(config.lightning.cues.map(cue => cue.timeMs === placingCue ? { ...cue, x: Number(point.x.toFixed(2)), distance: Number(point.distance.toFixed(2)) } : cue));
    placingCue = undefined; notify('Lightning impact placed on the water. Save config to keep it.');
  }
  function undo() {
    if (!history.length) return;
    future = [...future, $state.snapshot(config)]; config = history[history.length - 1]; history = history.slice(0, -1); lastEdit = '';
  }
  function redo() {
    if (!future.length) return;
    history = [...history, $state.snapshot(config)]; config = future[future.length - 1]; future = future.slice(0, -1); lastEdit = '';
  }
  function newSeed(path: 'seed' | 'waterThings.seed' = 'seed') { edit(path, crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff); }
  function exportConfig() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ landscape: $state.snapshot(config) }, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'meat-proxy-landscape.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Landscape exported. Import this file to restore the look.');
  }
  async function importConfig(event: Event) {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 65536) throw new Error('Choose a landscape or splash JSON file under 64 KB.');
      const value = JSON.parse(await file.text());
      const parsed = landscapeSchema.safeParse(value?.landscape ?? value);
      if (!parsed.success) throw new Error(`Invalid configuration: ${parsed.error.issues[0].path.join('.')} — ${parsed.error.issues[0].message}`);
      change(parsed.data); notify('Imported. Save config to use this look at startup.');
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Unable to import this file.', true); }
    input.value = '';
  }
  async function save() {
    saving = true;
    try {
      const response = await fetch('/__dev/api/splash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ landscape: $state.snapshot(config) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save the landscape.');
      saved = landscapeSchema.parse(result.config.landscape);
      notify('Saved to startup.json. The next app launch will use this landscape.');
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Save failed. Your edits are still here.', true); }
    finally { saving = false; }
  }
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage?.requestFullscreen(); }
    catch { notify('Fullscreen is unavailable in this browser.', true); }
  }
  function stopReplay() { cancelAnimationFrame(replayFrame); replay = false; fadePhase = 'done'; }
  function replayEntrance() {
    cancelAnimationFrame(replayFrame); replay = true; paused = false; previewTimeMs = titleTime = 0; lightningCue = 0; fadePhase = 'in'; replayStart = performance.now();
    const tick = (now: number) => {
      const elapsed = now - replayStart, reveal = prefersReducedMotion.current ? 100 : config.fadeInMs;
      fadePhase = elapsed < reveal ? 'in' : elapsed < reveal + 2200 ? 'hold' : elapsed < reveal + 2200 + config.fadeOutMs ? 'out' : 'done';
      if (fadePhase === 'done') { replay = false; return; }
      replayFrame = requestAnimationFrame(tick);
    };
    replayFrame = requestAnimationFrame(tick);
  }

  onMount(() => {
    let clockFrame = 0, previous = 0;
    const tickClock = (now: number) => {
      const delta = previous ? Math.min(100, now - previous) : 0; previous = now;
      if (workspace === 'landscape' && !paused && status === 'ready' && !loading && !document.hidden && !prefersReducedMotion.current) previewTimeMs += delta;
      clockFrame = requestAnimationFrame(tickClock);
    };
    clockFrame = requestAnimationFrame(tickClock);
    if (new URLSearchParams(location.search).get('camera') === '1' || new URLSearchParams(location.search).get('animation') === '1') { workspace = 'camera'; cameraOpened = true; }
    if (new URLSearchParams(location.search).get('sequence') === '1') { workspace = 'sequence'; sequenceOpened = true; }
    const abort = new AbortController();
    if (dev) void (async () => {
      try {
        const response = await fetch('/__dev/api/splash', { signal: abort.signal });
        if (!response.ok) throw new Error('The config writer is unavailable. Export your edits to keep them.');
        const result = await response.json();
        saved = landscapeSchema.parse(result.config.landscape); config = structuredClone($state.snapshot(saved)); canSave = true;
      } catch (reason) { if (!abort.signal.aborted) notify(reason instanceof Error ? reason.message : 'Unable to read startup.json.', true); }
      finally { loading = false; }
    })();
    return () => { abort.abort(); cancelAnimationFrame(replayFrame); cancelAnimationFrame(clockFrame); };
  });
</script>

<svelte:window onkeydown={event => { if (event.key === 'Escape' && placingCue !== undefined) placingCue = undefined; }} />

{#snippet cameraControls()}{@render controls(landscapeGroups.find(item => item.id === 'camera')!.fields)}{/snippet}

<svelte:head>
  <title>Landscape workshop · Meat Proxy</title>
  <meta name="description" content="Edit the original industrial skyline, Slop Corp, mountains and floating office debris." />
</svelte:head>

{#snippet controls(fields: readonly { path: LandscapePath; label: string; step?: number; unit?: string }[])}
  {#each fields as field (field.path)}
    {@const value = readLandscapeField(config, field.path)}
    {@const control = describeLandscapeField(field.path)}
    {@const id = `landscape-${field.path}`}
    {#if control.kind === 'number'}
      <div class="grid gap-1.5 border-b border-border/50 pb-4">
        <div class="flex items-center justify-between gap-3">
          <label for={id} class="text-xs text-foreground/85">{field.label}{field.unit ? ` (${field.unit})` : ''}</label>
          <Input {id} aria-label={field.label} class="h-7 w-24 text-right font-mono text-xs" type="number" min={control.min} step={field.step ?? .01} value={value as number}
            onchange={event => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) edit(field.path, Math.max(control.min, field.path === 'seed' || field.path === 'waterThings.seed' || field.path === 'quality.fps' || field.path === 'lightning.afterStrokes' ? Math.round(next) : next)); else event.currentTarget.value = String(value); }} />
        </div>
        {#if field.path === 'seed' || field.path === 'waterThings.seed'}
          <Button variant="outline" class="mt-1 h-8 text-xs" onclick={() => newSeed(field.path as 'seed' | 'waterThings.seed')}><Shuffle class="size-3.5" />{field.path === 'seed' ? 'Vary the weather' : 'Scatter water things'}</Button>
        {:else}
          <Slider type="single" thumbLabel={field.label} class="h-4" min={control.min} max={Math.max(control.max, value as number)} step={field.step ?? .01} value={value as number}
            onValueChange={next => { if (Math.abs(next - Number(value)) > (field.step ?? .01) / 2 + Number.EPSILON) edit(field.path, next); }}
            onValueCommit={next => { if (next !== value) edit(field.path, next); }} />
        {/if}
      </div>
    {:else if control.kind === 'toggle'}
      <div class="flex items-center justify-between border-b border-border/50 py-2 pb-4">
        <label for={id} class="text-xs text-foreground/85">{field.label}</label>
        <Switch {id} aria-label={field.label} checked={value as boolean} onCheckedChange={next => edit(field.path, next)} />
      </div>
    {:else if control.kind === 'select'}
      <label class="grid gap-2 text-xs text-foreground/85" for={id}>{field.label}
        <select {id} aria-label={field.label} class="h-9 rounded-md border border-input bg-background px-3 capitalize" value={value as string} onchange={event => edit(field.path, event.currentTarget.value)}>
          {#each control.options as option}<option value={option}>{option}</option>{/each}
        </select>
      </label>
    {:else if control.kind === 'cues'}
      <div class="grid gap-2 border-b border-border/50 pb-4"><h4 class="text-xs text-foreground/85">{field.label}</h4>
        <LightningCues cues={config.lightning.cues} timeMs={previewTimeMs} duration={config.lightning.duration} onchange={setCues} onseek={seek} onplace={place} />
      </div>
    {:else if control.kind === 'text'}
      <label class="grid gap-2 border-b border-border/50 pb-4 text-xs text-foreground/85" for={id}>{field.label}
        <Input {id} aria-label={field.label} maxlength={control.maxLength} value={value as string}
          oninput={event => edit(field.path, event.currentTarget.value)} />
      </label>
    {:else}
      <div class="flex items-center gap-3 rounded-md border border-border/60 bg-background/30 p-2.5">
        <input {id} aria-label={field.label} type="color" class="size-9 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5" value={value as string} oninput={event => edit(field.path, event.currentTarget.value)} />
        <label class="flex-1 text-xs text-foreground/85" for={id}>{field.label}</label>
        <Input aria-label={`${field.label} hex`} class="h-7 w-23 font-mono text-[11px] uppercase" maxlength={7} value={value as string}
          onchange={event => { const next = event.currentTarget.value; if (/^#[\da-fA-F]{6}$/.test(next)) edit(field.path, next.toLowerCase()); else { event.currentTarget.value = String(value); notify('Use a six-digit hex color, such as #444b40.', true); } }} />
      </div>
    {/if}
  {/each}
{/snippet}

<div class="min-h-dvh bg-[#10130f] text-foreground">
  <header class="flex min-h-16 flex-wrap items-center gap-4 border-b border-border/70 bg-card/40 px-4 py-3 sm:px-8">
    <a href="/" class="flex items-center gap-2 font-(family-name:--hud-font) text-2xl font-extrabold tracking-wide"><Mountain class="size-6 text-primary" />MEAT<span class="text-primary">/</span>PROXY</a>
    <span class="hidden border-l border-border pl-5 font-mono text-[10px] tracking-[.18em] text-muted-foreground sm:block">WORLD BUILDING / 003</span>
    <a href="/__dev/splash" class="ml-auto flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft class="size-3.5" />Splash workbench</a>
  </header>

  <main class="mx-auto max-w-[1920px] p-4 sm:p-8">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p class="mb-1 font-mono text-[10px] tracking-[.22em] text-primary">LANDSCAPE WORKSHOP</p><h1 class="font-(family-name:--hud-font) text-4xl font-bold sm:text-5xl">Alpine Megacity<span class="text-primary">.</span></h1><p class="mt-1 text-sm text-muted-foreground">The industrial waterfront, SLOP CORP, and the riverside driving sequence.</p></div>
      <div class="flex flex-wrap items-center gap-2">
        <input bind:this={upload} aria-label="Import landscape file" type="file" accept=".json,application/json" class="hidden" onchange={importConfig} />
        <Button variant="outline" disabled={loading} onclick={() => upload.click()}><Upload class="size-3.5" />Import</Button>
        <Button variant="outline" disabled={loading} onclick={exportConfig}><Download class="size-3.5" />Export</Button>
        <Button disabled={!canSave || loading || saving || !dirty} onclick={save}><Save class="size-3.5" />{saving ? 'Saving…' : 'Save config'}</Button>
      </div>
    </div>

    <nav aria-label="Workshop mode" class="mb-5 flex flex-wrap gap-2 border-b border-border pb-3">
      <Button variant="ghost" aria-pressed={workspace==='landscape'} class="aria-pressed:bg-primary/10 aria-pressed:text-primary" onclick={()=>workspace='landscape'}>Landscape</Button>
      <Button variant="ghost" aria-pressed={workspace==='camera'} class="aria-pressed:bg-primary/10 aria-pressed:text-primary" onclick={()=>{workspace='camera';cameraOpened=true;}}>Camera pan</Button>
      <Button variant="ghost" aria-pressed={workspace==='sequence'} class="aria-pressed:bg-primary/10 aria-pressed:text-primary" onclick={()=>{workspace='sequence';sequenceOpened=true;}}>Sequence</Button>
    </nav>
    {#if sequenceOpened}<div class:hidden={workspace!=='sequence'}>
      <SequenceEditor active={workspace==='sequence'} settings={config} onchange={change} onundo={undo} onredo={redo} canUndo={!!history.length} canRedo={!!future.length}/>
      <p role="status" class="mt-3 text-xs text-primary">{message || (dirty ? 'Unsaved sequence and landscape changes' : 'Matches startup.json')}</p>
    </div>{/if}
    {#if cameraOpened}<div class:hidden={workspace!=='camera'}>
      <CameraPan active={workspace==='camera'} settings={config}>
        {#snippet controls()}{@render cameraControls()}{/snippet}
      </CameraPan>
      <p aria-live="polite" role="status" class={`mt-3 text-xs ${error ? 'text-red-400' : 'text-primary'}`}>{message || (dirty ? 'Unsaved camera and landscape changes' : 'Matches startup.json')}</p>
    </div>{/if}
    {#if workspace==='landscape'}
    <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section class="min-w-0 xl:sticky xl:top-5" aria-label="Landscape preview">
        <div class="overflow-hidden rounded-lg border border-border bg-black shadow-2xl shadow-black/20">
          <div class="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-1.5">
            <span class="flex items-center gap-2 font-mono text-[10px] tracking-wider text-muted-foreground"><span class={`size-1.5 rounded-full ${status === 'ready' ? 'bg-primary' : 'bg-muted-foreground'}`}></span>{status === 'loading' ? 'ASSEMBLING WORLD' : status === 'fallback' ? 'FALLBACK PREVIEW' : 'LIVE WATERFRONT'}</span>
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label={paused ? 'Play landscape' : 'Pause landscape'} title={paused ? 'Play' : 'Pause'} onclick={() => { stopReplay(); paused = !paused; }}>{#if paused}<Play class="size-4" />{:else}<Pause class="size-4" />{/if}</Button>
              <Button variant="ghost" size="icon-sm" aria-label="Toggle title artwork" title="Show title artwork" aria-pressed={artwork} onclick={() => artwork = !artwork}>{#if artwork}<Eye class="size-4" />{:else}<EyeOff class="size-4" />{/if}</Button>
              <Button variant="ghost" size="icon-sm" aria-label="Fullscreen landscape" title="Fullscreen" onclick={fullscreen}><Expand class="size-4" /></Button>
            </div>
          </div>
          <div bind:this={stage} class="relative aspect-video min-h-64 overflow-hidden bg-black sm:aspect-auto sm:h-[min(48dvh,760px)] sm:min-h-80" data-landscape-stage>
            {#key replayStart}
              <div class="absolute inset-0" style:opacity={fadePhase === 'out' ? 0 : 1} style:transition={fadePhase === 'out' ? `opacity ${config.fadeOutMs}ms linear` : 'none'}>
                <SplashLandscape settings={config} time={previewTimeMs} {paused} {lightningCue} reducedMotion={prefersReducedMotion.current} preview={!replay} onstats={value => stats = value} onstatus={value => status = value} />
              </div>
              {#if artwork}<SplashScreen landscape={false} {paused} loop={!replay} bind:time={titleTime} />{/if}
            {/key}
            <div class="pointer-events-none absolute inset-x-4 top-4 flex justify-between font-mono text-[9px] tracking-widest text-white/45" aria-hidden="true"><span>SEED {config.seed.toString().padStart(6, '0')}</span><span>+ {config.speed} / SEC</span></div>
            {#if replay}<span class="absolute bottom-4 left-4 rounded border border-white/10 bg-black/70 px-3 py-1.5 font-mono text-[10px] text-white/70">{fadePhase === 'in' ? 'FADING IN' : fadePhase === 'out' ? 'APP HANDOFF / FADING OUT' : 'HOLDING SCENE'}</span>{/if}
            {#if prefersReducedMotion.current}<span class="absolute bottom-4 right-4 rounded bg-black/70 px-3 py-1.5 text-[10px] text-white/65">Reduced motion · still preview</span>{/if}
            {#if placingCue !== undefined}
              <button type="button" aria-label="Place lightning impact on water" class="absolute inset-0 z-10 cursor-crosshair" onclick={pickWater} onkeydown={event => { if (event.key === 'Escape') placingCue = undefined; }}>
                <span class="absolute bottom-3 left-3 rounded bg-black/80 px-3 py-2 text-xs text-white">Click the water for the {placingCue} ms strike · Esc cancels</span>
              </button>
            {/if}
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-3 py-2">
            <div class="flex flex-wrap gap-1"><Button variant="ghost" class="h-7 px-2 text-xs" onclick={replayEntrance}><RotateCcw class="size-3.5" />Replay entrance</Button>
              <Button variant="ghost" class="h-7 px-2 text-xs" onclick={() => { stopReplay(); replayStart = performance.now(); lightningCue = 0; }}><RotateCcw class="size-3.5" />Reload Blender models</Button>
              <Button variant="ghost" class="h-7 px-2 text-xs" disabled={!config.lightning.enabled || prefersReducedMotion.current || status !== 'ready'} onclick={() => lightningCue++}><Zap class="size-3.5" />{paused ? 'Inspect lightning' : 'Test lightning'}</Button></div>
            <span class="font-mono text-[10px] text-muted-foreground">{config.quality.fps} FPS LIMIT <span class="mx-1.5 text-border">/</span> {config.quality.megapixels.toFixed(1)} MP <span class="mx-1.5 text-border">/</span> {stats.calls} DRAWS</span>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <label class="text-xs text-muted-foreground" for="landscape-playhead">From start</label>
          <Input id="landscape-playhead" aria-label="Landscape playhead (ms)" class="h-8 w-28 font-mono text-xs" type="number" min="0" step="1" value={Math.round(previewTimeMs)} onfocus={() => paused = true} onchange={event => seek(event.currentTarget.valueAsNumber)} />
          <span class="text-xs text-muted-foreground">ms</span>
          <Button variant="outline" class="ml-auto h-8 text-xs" onclick={() => { seek(0); paused = false; }}>Play from start</Button>
        </div>
        <div class="mt-3"><TimelineScrubber label="Landscape playhead" max={Math.ceil(timelineEnd)} value={Math.round(previewTimeMs)} onseek={seek} /></div>

        <div class="mt-5 flex items-center justify-between"><h2 class="font-mono text-[10px] tracking-[.16em] text-muted-foreground">START WITH A MOOD</h2><span class="text-[10px] text-muted-foreground">Everything stays editable</span></div>
        <div class="mt-2 grid grid-cols-2 gap-2 2xl:grid-cols-4">
          {#each landscapePresets as preset}
            <button type="button" class="group min-w-0 rounded-md border border-border bg-card/30 p-3 text-left transition-colors hover:border-primary/50 hover:bg-card aria-pressed:border-primary/70 aria-pressed:bg-primary/5" disabled={loading} aria-label={`Preset: ${preset.name}`} aria-pressed={activePreset === preset.name} onclick={() => change(structuredClone(preset.settings))}>
              <span class="mb-3 flex h-1.5 gap-0.5 overflow-hidden rounded-sm" aria-hidden="true">{#each preset.colors as tone}<span class="flex-1" style:background-color={tone}></span>{/each}</span>
              <span class="flex items-center justify-between text-xs font-medium">{preset.name}{#if activePreset === preset.name}<Check class="size-3 text-primary" />{/if}</span>
              <span class="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{preset.description}</span>
            </button>
          {/each}
        </div>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span class="flex items-center gap-1.5"><span class={`size-1.5 rounded-full ${dirty ? 'bg-amber-500' : 'bg-primary'}`}></span>{loading ? 'Reading startup.json…' : dirty ? 'Unsaved landscape' : 'Matches startup.json'}</span>
          <a href="/__dev/splash" class="flex items-center gap-1 hover:text-foreground">Tune the title sequence <ArrowUpRight class="size-3" /></a>
        </div>
        <p class="mt-2 text-[11px] leading-relaxed text-muted-foreground">{dev ? 'Save config writes to src/lib/components/splash/startup.json. Refresh or launch the app to use it.' : 'Export your look here. Open this workshop on the local development server to save it into the project.'}</p>
        <p class="mt-2 text-[11px] leading-relaxed text-muted-foreground">In Blender, open Waterfront → Save &amp; export splash, then reload the models here. Model offsets are relative to that saved layout.</p>
        <p aria-live="polite" role="status" class={`mt-2 min-h-5 text-xs ${error ? 'text-red-400' : 'text-primary'}`}>{message}</p>
      </section>

      <section aria-label="Landscape controls" class="min-w-0 overflow-hidden rounded-lg border border-border bg-card/35">
        <div class="border-b border-border p-4">
          <div class="mb-3 flex items-center justify-between"><h2 class="font-(family-name:--hud-font) text-xl font-semibold">World controls</h2><div class="flex gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Undo landscape edit" title="Undo" disabled={!history.length} onclick={undo}><Undo2 class="size-3.5" /></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Redo landscape edit" title="Redo" disabled={!future.length} onclick={redo}><Redo2 class="size-3.5" /></Button>
          </div></div>
          <div class="relative"><Search class="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" /><Input type="search" class="h-9 pl-8 text-xs" aria-label="Find a landscape control" placeholder="Find a control…" bind:value={search} /></div>
          <nav aria-label="Control groups" class="mt-3 grid grid-cols-3 gap-1">
            {#each landscapeGroups as item}<Button variant="ghost" class="h-8 justify-start px-2 text-[11px] aria-pressed:bg-primary/10 aria-pressed:text-primary" aria-pressed={group === item.id && !search} onclick={() => { group = item.id; search = ''; }}>{item.name}</Button>{/each}
          </nav>
        </div>
        <fieldset disabled={loading} class="grid min-w-0 gap-6 p-4 disabled:opacity-40 xl:max-h-[calc(100dvh-400px)] xl:min-h-72 xl:overflow-y-auto">
          {#each visibleGroups as item (item.id)}
            <div class="grid gap-4"><div><h3 class="text-sm font-medium">{item.name}</h3><p class="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p></div>{@render controls(item.fields)}</div>
          {:else}<p class="py-6 text-center text-xs text-muted-foreground">No controls match “{search}”.</p>{/each}
        </fieldset>
        <div class="flex flex-wrap items-center justify-between gap-1 border-t border-border px-3 py-2">
          <Button variant="ghost" class="h-8 px-2 text-[11px]" disabled={loading || !dirty} onclick={() => change(structuredClone($state.snapshot(saved)))}><RotateCcw class="size-3" />Revert to saved</Button>
          <Button variant="ghost" class="h-8 px-2 text-[11px]" disabled={loading} onclick={() => change(structuredClone(landscapeDefaults))}><X class="size-3" />Factory look</Button>
        </div>
      </section>
    </div>
    {/if}
  </main>
</div>
