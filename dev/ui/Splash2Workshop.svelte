<script lang="ts">
  import { ArrowDownToLine, ArrowUpRight, Crosshair, Expand, Eye, EyeOff, Layers, Pause, Play, RotateCcw, Save, Settings2, SkipForward } from '@lucide/svelte';
  import { onMount, tick, untrack } from 'svelte';
  import { dev } from '$app/environment';
  import { prefersReducedMotion } from 'svelte/motion';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Slider } from '$lib/components/ui/slider';
  import { Switch } from '$lib/components/ui/switch';
  import * as Tabs from '$lib/components/ui/tabs';
  import Splash2Screen from '$lib/components/splash/Splash2Screen.svelte';
  import Splash2Playback from '$lib/components/splash/Splash2Playback.svelte';
  import SubtitleEditor from './SubtitleEditor.svelte';
  import { subtitleTimelineTime } from '$lib/components/splash/splash2-subtitles';
  import { splash2Artwork, splash2Portraits } from '$lib/components/splash/splash2-assets';
  import { defaultSplash2Config, resolveSplash2Config, splash2Durations, splash2SkipTime, splash2LayerNames, splash2PortraitNames, splash2Entrances, splash2DriftPartNames, splash2DriftPart, splash2DriftStartsAt, splash2ReviewerLandsAt, splash2AudioEnd, splash2AudioWindow, neutralSplash2Grade, type Splash2ColorGrade, type Splash2LayerName, type Splash2Timing } from '$lib/components/splash/splash2-playback-config';
  import { driftLabels, driftPresets, applyDriftPreset } from './splash2-drift';
  import { timingPresets, applyTimingPreset, timingPresetMatches, timingLandings, type Splash2TimingPreset } from './splash2-timing';
  import { controls, presets } from '../tooling/splash/color-workshop/grade.mjs';
  import { splash2ColorSources } from './splash2-color-assets';
  import type { ColorPreviewRequest, ColorPreviewResult } from './splash2-color.worker';
  import back2Reference from '../assets/source/splash2/back2-reference.webp';

  let config = $state(resolveSplash2Config());
  let savedSubtitles = $state(JSON.stringify(defaultSplash2Config.subtitles));
  let time = $state(0), sceneTime = $state(0), paused = $state(false), loop = $state(true);
  let playback: Splash2Playback;
  let imagesReady = $state(false), sceneReady = $state(false), audioReady = $state(false), audioDuration = $state(0), audioError = $state('');
  let view = $state<'sequence' | 'reference'>('sequence');
  let tab = $state('timing');
  let pagesUrl = $state('http://127.0.0.1:4173/');
  let selected = $state<Splash2LayerName>('mainFrame');
  let motionGroup = $state<'structure' | 'title' | null>(null);
  let timingBeforePreset = $state<Splash2Timing | null>(null);
  let rhythmPresets = $derived(timingPresets(config));
  let landings = $derived(timingLandings(config));
  let hiddenLayers = $state<Splash2LayerName[]>([]);
  let saving = $state(false), message = $state(''), cycles = $state(0);
  let stage: HTMLDivElement;
  let colorScope = $state<'all' | Splash2LayerName>('all'), showGrade = $state(true);
  let colorBusy = $state(false), colorError = $state('');
  let colorWorker = $state<Worker>();
  let gradedSources = $state<Partial<Record<Splash2LayerName, string>>>({});
  let gradedPortrait = $state('');
  let previewId = 0, disposed = false;
  let blobUrls: string[] = [];
  let originalSources = $derived(splash2ColorSources(config.portrait));
  let artworkSources = $derived(showGrade && gradedPortrait === config.portrait ? { ...originalSources, ...gradedSources } : originalSources);
  let colorLayers = $derived(colorScope === 'all' ? [...splash2LayerNames] : [colorScope]);
  const colorPresets = { 'Neutral': neutralSplash2Grade, ...Object.fromEntries(Object.entries(presets).filter(([name]) => name !== 'Original')) } as Record<string, Splash2ColorGrade>;
  let durations = $derived(splash2Durations(config));
  let audioAnchors = $derived({ handoff: durations.complete, game: durations.complete + 300 });
  let total = $derived(Math.max(1, loop && !prefersReducedMotion.current ? durations.cycle : durations.complete, splash2AudioEnd(config.audio, audioDuration, audioAnchors)));
  let audioWindow = $derived(splash2AudioWindow(config.audio, audioDuration, audioAnchors));
  let stageReady = $derived(imagesReady && (!config.scene.enabled || sceneReady));
  let currentLayer = $derived(config.layers[selected]);
  let currentMotion = $derived(config.motion[selected]);
  let driftPart = $derived(motionGroup ?? splash2DriftPart(selected));
  let currentDrift = $derived(config.drift.parts[driftPart]);
  let driftStart = $derived(splash2DriftStartsAt(config));
  let phase = $derived(time >= durations.complete ? 'Game handoff · audio tail' : time >= durations.assembled ? 'Hold the verdict' : time < config.openingDelay ? 'Audio lead-in' :
    splash2Artwork[splash2LayerNames.filter(name => time >= config.openingDelay + config.timing[`${name}At`]).sort((a, b) => config.timing[`${b}At`] - config.timing[`${a}At`])[0] ?? 'background'].label);

  function replay() { time = sceneTime = 0; paused = false; view = 'sequence'; }
  function seek(value: number) { time = sceneTime = value; paused = true; view = 'sequence'; }
  async function previewSkip() {
    paused = false; view = 'sequence';
    await tick(); playback?.skipIntro();
  }
  function previewHandoff() {
    try {
      const url = new URL(pagesUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Enter the Pages dev or preview URL.');
      url.searchParams.set('intro-preview', 'cue');
      url.hash = encodeURIComponent(JSON.stringify(resolveSplash2Config($state.snapshot(config))));
      paused = true;
      window.open(url.href, '_blank', 'noopener');
      message = 'Opened a temporary Pages demo with the current unsaved timings';
    } catch (error) { message = String(error); }
  }
  function edit(name: Splash2LayerName) { selected = name; motionGroup = null; tab = 'placement'; }
  function toggleLayer(name: Splash2LayerName) { hiddenLayers = hiddenLayers.includes(name) ? hiddenLayers.filter(item => item !== name) : [...hiddenLayers, name]; }
  function reset() { config = resolveSplash2Config(defaultSplash2Config); hiddenLayers = []; showGrade = true; motionGroup = null; timingBeforePreset = null; cycles = 0; replay(); }
  function chooseTimingPreset(preset: Splash2TimingPreset) {
    timingBeforePreset = $state.snapshot(config.timing);
    applyTimingPreset(config, preset); replay();
  }
  function undoTimingPreset() {
    if (timingBeforePreset) { config.timing = timingBeforePreset; timingBeforePreset = null; replay(); }
  }
  function customDriftStart(at: number) { config.drift.at = Math.max(0, at - config.openingDelay); config.drift.start = 'time'; }
  function colorValue(key: keyof Splash2ColorGrade) { return config.color[colorLayers[0]][key]; }
  function colorMixed(key: keyof Splash2ColorGrade) { return colorLayers.some(name => config.color[name][key] !== colorValue(key)); }
  function changeColor(key: keyof Splash2ColorGrade, value: number) {
    for (const name of colorLayers) config.color[name][key] = value;
    showGrade = true;
  }
  function applyColorPreset(grade: Splash2ColorGrade) {
    for (const name of colorLayers) config.color[name] = { ...grade };
    showGrade = true;
  }

  // Grade preserved originals off the UI thread; placement and the playhead do
  // not invalidate the color preview. Decode all results before swapping them.
  $effect(() => {
    const worker = colorWorker;
    const portrait = config.portrait, color = $state.snapshot(config.color);
    if (!worker) return;
    const sources = splash2ColorSources(portrait), id = ++previewId;
    colorBusy = true; colorError = '';
    const layers = Object.fromEntries(splash2LayerNames.map(name => [name, { source: sources[name], grade: color[name] }])) as ColorPreviewRequest['layers'];
    const timeout = setTimeout(() => worker.postMessage({ id, layers } satisfies ColorPreviewRequest), 100);
    return () => clearTimeout(timeout);
  });
  function exportConfig() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(resolveSplash2Config($state.snapshot(config)), null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'meat-proxy-splash2.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); message = 'Configuration exported';
  }
  async function saveConfig() {
    saving = true;
    const subtitleSnapshot = JSON.stringify(config.subtitles);
    try {
      const response = await fetch('/__dev/api/splash2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resolveSplash2Config($state.snapshot(config))) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed');
      savedSubtitles = subtitleSnapshot;
      message = 'Saved to splash2.json';
    } catch (error) { message = error instanceof Error ? error.message : 'Save failed'; }
    finally { saving = false; }
  }
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.requestFullscreen(); }
    catch { message = 'Fullscreen is unavailable in this browser'; }
  }
  onMount(() => {
    const worker = new Worker(new URL('./splash2-color.worker.ts', import.meta.url), { type: 'module', name: 'splash2-color' });
    colorWorker = worker;
    worker.onmessage = async ({ data }: MessageEvent<ColorPreviewResult>) => {
      if (disposed || data.id !== previewId) return;
      if (data.error || !data.layers) { colorBusy = false; colorError = data.error || 'Color preview failed.'; return; }
      const urls: string[] = [], sources = {} as Record<Splash2LayerName, string>;
      const portrait = untrack(() => config.portrait);
      try {
        await Promise.all(Object.entries(data.layers).map(async ([name, asset]) => {
          const url = asset.blob ? URL.createObjectURL(asset.blob) : asset.source;
          if (asset.blob) urls.push(url);
          const image = new Image(); image.src = url; await image.decode();
          sources[name as Splash2LayerName] = url;
        }));
        if (disposed || data.id !== previewId) { urls.forEach(url => URL.revokeObjectURL(url)); return; }
        const previous = blobUrls; blobUrls = urls;
        gradedSources = sources; gradedPortrait = portrait; colorBusy = false;
        await tick(); previous.forEach(url => URL.revokeObjectURL(url));
      } catch (error) {
        urls.forEach(url => URL.revokeObjectURL(url));
        if (!disposed && data.id === previewId) { colorBusy = false; colorError = error instanceof Error ? error.message : String(error); }
      }
    };
    worker.onerror = () => { colorBusy = false; colorError = 'Color preview could not start. Reload the workshop to retry.'; };
    const controller = new AbortController();
    void fetch('/__dev/api/splash2', { signal: controller.signal }).then(async response => {
      if (response.ok) { config = resolveSplash2Config((await response.json()).config); savedSubtitles = JSON.stringify(config.subtitles); }
    }).catch(() => { message = 'Saved configuration could not be loaded'; });
    return () => { disposed = true; controller.abort(); worker.terminate(); blobUrls.forEach(url => URL.revokeObjectURL(url)); };
  });
</script>

<svelte:head>
  <title>Splash workbench · Meat Proxy</title>
  <meta name="description" content="Direct the Meat Proxy opening: pylons, rings, reviewer, title, Hostile Review, and the final verdict." />
</svelte:head>

{#snippet numberField(label: string, value: number, change: (value: number) => void, min = 0, max = 60000, step = 50, unit = 'ms')}
  <label class="number-control"><span>{label}</span><span class="number-wrap"><Input aria-label={label} type="number" {min} {max} {step} {value}
    oninput={event => change(Math.max(min, Math.min(max, Number(event.currentTarget.value) || 0)))} /><small>{unit}</small></span></label>
{/snippet}
{#snippet timingField(label: string, key: keyof Splash2Timing)}
  {@render numberField(label, config.timing[key], value => config.timing[key] = value)}
{/snippet}

<div class="splash2-lab">
  <header class="lab-header">
    <a class="brand" href="/" aria-label="Meat Proxy arena"><Crosshair size={22} strokeWidth={1.5} /><span>MEAT<span>/</span>PROXY</span></a>
    <span class="header-path">DESIGN LAB <i>/</i> SPLASH</span>
    <nav aria-label="Workbench"><a class="active" href="/__dev/splash" aria-current="page">Splash</a></nav>
    <a class="landscape-link" href="/__dev/landscape">Landscape workshop <ArrowUpRight size={13} /></a>
  </header>
  <main>
    <div class="heading">
      <div><div class="overline">MOTION STUDY <span>003</span></div><h1>Build the entrance<span>.</span></h1><p>The fortress. The reviewer. One hostile review.</p></div>
      <div class="actions"><Button variant="outline" onclick={exportConfig}><ArrowDownToLine size={14} /> Export config</Button>{#if dev}<Button disabled={saving} onclick={saveConfig}><Save size={14} />{saving ? 'Saving…' : 'Save config'}</Button>{/if}</div>
    </div>
    <div class="workspace">
      <Tabs.Root class="preview" role="region" aria-label="Splash preview" bind:value={view}>
        <div class="preview-toolbar">
          <Tabs.List variant="line" aria-label="Preview view"><Tabs.Trigger value="sequence"><Layers size={13} /> Sequence</Tabs.Trigger><Tabs.Trigger value="reference">References</Tabs.Trigger></Tabs.List>
          <div class="preview-tools"><span>1536 × 1024 <i>/</i> FIT</span><Button variant="ghost" size="icon-sm" aria-label="Fullscreen preview" onclick={fullscreen}><Expand size={15} /></Button></div>
        </div>
        <div class="color-preview-toolbar" data-color-busy={colorBusy}>
          <div role="group" aria-label="Color comparison"><Button size="sm" variant={showGrade ? 'ghost' : 'secondary'} aria-label="Preview original colors" aria-pressed={!showGrade} onclick={() => showGrade = false}>Original</Button><Button size="sm" variant={showGrade ? 'secondary' : 'ghost'} aria-label="Preview graded colors" aria-pressed={showGrade} onclick={() => showGrade = true}>Graded</Button></div>
          <span role="status" class:error={!!colorError}>{colorError || (colorBusy ? 'Updating colors…' : showGrade ? 'Graded preview' : 'Original colors')}</span>
        </div>
        <div class="stage" bind:this={stage}>
          <Splash2Playback {config} {loop} preview playing={stageReady && view === 'sequence'} paused={paused || colorBusy} bind:time bind:sceneTime bind:this={playback}
            onprepared={ready => audioReady = ready}
            onloaded={(duration, failed) => { audioDuration = duration; audioError = failed ? 'Could not load the opening audio. Check the file path.' : ''; }} />
          <Tabs.Content value="sequence" class="sequence-view">
            <Splash2Screen {config} {loop} {artworkSources} paused={paused || !stageReady || view === 'reference' || colorBusy} {time} {sceneTime} externalClock {hiddenLayers}
              onready={() => imagesReady = true} onscenestatus={status => sceneReady = status !== 'loading'} oncomplete={() => cycles += 1} onerror={error => message = error.message} />
          </Tabs.Content>
          <Tabs.Content value="reference" class="reference-view">
            <img src={back2Reference} alt="Supplied reference for the assembled pylons and rings" />
            <span>PYLONS &amp; RINGS · PLACEMENT REFERENCE</span>
          </Tabs.Content>
          <div class="stage-corner" aria-hidden="true">{view === 'sequence' ? `OPENING / 02 · ${splash2Portraits[config.portrait].label.toUpperCase()}` : 'SOURCE REFERENCE'}</div>
        </div>
        <div class="transport">
          <Button class="play" aria-label={paused ? 'Play sequence' : 'Pause sequence'} onclick={() => { if (paused && time >= total) time = sceneTime = 0; paused = !paused; view = 'sequence'; }}>{#if paused}<Play size={15} fill="currentColor" />{:else}<Pause size={15} />{/if}</Button>
          <Button variant="ghost" size="icon-sm" aria-label="Replay sequence" onclick={replay}><RotateCcw size={15} /></Button>
          <div class="timecode"><strong>{(time / 1000).toFixed(2)}<small>s</small></strong><span>/ {(total / 1000).toFixed(2)}s</span></div>
          <span class="phase">{paused ? 'Paused' : phase}</span>
          <Button variant="ghost" size="sm" class="final-frame" onclick={() => seek(durations.assembled)}><SkipForward size={13} /> Final frame</Button>
          <div class="loop-toggle"><Switch id="splash2-loop" size="sm" bind:checked={loop} /><Label for="splash2-loop">Loop</Label></div>
        </div>
        <div class="timeline">
          <div class="timeline-heading"><span>THE SEQUENCE</span><span>DRAG TO SCRUB</span></div>
          <Slider class="scrubber" type="single" min={0} max={total} step={10} value={Math.min(time, total)} thumbLabel="Sequence playhead"
            onValueChange={value => { if (Math.abs(value - Math.min(time, total)) >= 10) seek(value); }} onValueCommit={seek} />
          <div class="tracks">
            <div class="playhead" style:left={`calc(116px + (100% - 116px) * ${Math.min(time / total, 1)})`}></div>
            {#each splash2LayerNames as name, index}
              {@const art = splash2Artwork[name]}
              <div class="track" data-artwork-track={name}><Button variant="ghost" class={selected === name ? 'selected' : ''} onclick={() => edit(name)}><span>{String(index + 1).padStart(2, '0')}</span>{art.label}</Button>
                <div class="track-bed"><Button variant="ghost" aria-label={`Seek to ${art.label} entrance`} class="clip" style={`left: ${(config.openingDelay + config.timing[`${name}At`]) / total * 100}%; width: ${Math.max(.5, config.timing[`${name}Duration`] / total * 100)}%; --clip-color: ${art.color}`} onclick={() => seek(config.openingDelay + config.timing[`${name}At`])}><span>{config.motion[name].entrance.toUpperCase()}</span></Button></div>
              </div>
            {/each}
            <div class="track" data-subtitle-track><Button variant="ghost" onclick={() => tab = 'subtitles'}><span>CC</span>Subtitles</Button>
              <div class="track-bed">
                {#each config.subtitles.cues as cue, index (cue.id)}
                  {@const start = Math.max(config.audio.at, subtitleTimelineTime(cue.startMs, config.audio, config.subtitles.offsetMs))}
                  {@const end = subtitleTimelineTime(cue.endMs, config.audio, config.subtitles.offsetMs)}
                  {#if end > start}
                    <Button variant="ghost" class="clip" aria-label={`Seek to subtitle ${index+1}`} title={cue.text} style={`left: ${start / total * 100}%; width: ${Math.max(.3, (end-start) / total * 100)}%; --clip-color: #9bafb8`} onclick={() => { tab = 'subtitles'; seek(start); }}><span>{cue.text}</span></Button>
                  {/if}
                {/each}
              </div>
            </div>
            <div class="track" data-audio-track><Button variant="ghost" onclick={() => tab = 'audio'}><span>♪</span>Opening audio</Button>
              <div class="track-bed"><Button variant="ghost" aria-label="Seek to opening audio" class="clip" style={`left: ${config.audio.at / total * 100}%; width: ${Math.max(.5, (audioWindow.end - config.audio.at) / total * 100)}%; --clip-color: ${config.audio.enabled ? '#b9a6dd' : '#677365'}`} onclick={() => seek(config.audio.at)}><span>{config.audio.url.split('/').pop()}</span></Button></div>
            </div>
            <div class="track"><Button variant="ghost" onclick={() => tab = 'audio'}><span>↪</span>Skip destination</Button><div class="track-bed"><Button variant="ghost" class="clip" aria-label="Seek to skip destination" style={`left: ${splash2SkipTime(config) / total * 100}%; width: .5%; --clip-color: #ddc4a3`} onclick={() => seek(splash2SkipTime(config))}><span>SKIP</span></Button></div></div>
            <div class="track"><Button variant="ghost" onclick={() => seek(durations.complete)}><span>→</span>Game handoff</Button><div class="track-bed"><Button variant="ghost" class="clip" aria-label="Preview game handoff" style={`left: ${durations.complete / total * 100}%; width: ${Math.max(.5, config.scene.fadeOutMs / total * 100)}%; --clip-color: #b5c8a0`} onclick={() => seek(durations.complete)}><span>EXIT INTO GAME</span></Button></div></div>
          </div>
          <div class="timeline-scale"><span>0.00s</span><span>{(total / 2 / 1000).toFixed(2)}s</span><span>{(total / 1000).toFixed(2)}s</span></div>
        </div>
      </Tabs.Root>
      <Tabs.Root class="inspector" role="complementary" aria-label="Splash controls" bind:value={tab}>
        <div class="inspector-heading"><span><Settings2 size={14} /> DIRECT THE SCENE</span><Button variant="ghost" size="icon-sm" aria-label="Reset all settings" onclick={reset}><RotateCcw size={14} /></Button></div>
        <div class="portrait-section"><h2>CHOOSE THE REVIEWER</h2><div class="portrait-picker" role="group" aria-label="Reviewer version">
          {#each splash2PortraitNames as name}<Button variant="outline" aria-label={`Use ${splash2Portraits[name].label} reviewer`} aria-pressed={config.portrait === name} class={config.portrait === name ? 'active' : ''} onclick={() => config.portrait = name}><img src={splash2Portraits[name].src} alt="" /><span>{splash2Portraits[name].label}</span></Button>{/each}
        </div></div>
        <Tabs.List class="inspector-tabs" aria-label="Inspector settings"><Tabs.Trigger value="timing">Timing</Tabs.Trigger><Tabs.Trigger value="placement">Placement</Tabs.Trigger><Tabs.Trigger value="motion">Motion</Tabs.Trigger><Tabs.Trigger value="color">Color</Tabs.Trigger><Tabs.Trigger value="audio">Audio</Tabs.Trigger><Tabs.Trigger value="subtitles">Subtitles</Tabs.Trigger><Tabs.Trigger value="handoff">Handoff</Tabs.Trigger></Tabs.List>
        <Tabs.Content value="timing" class="inspector-body">
          <div class="control-section"><h2>TIMING PRESETS</h2>
            <div class="preset-buttons" role="group" aria-label="Timing presets">{#each rhythmPresets as preset}<Button variant="outline" aria-label={preset.name} aria-pressed={timingPresetMatches(config, preset)} onclick={() => chooseTimingPreset(preset)}><span>{preset.name}</span><small>{preset.hint}</small></Button>{/each}</div>
            <p class="control-note">Presets change only timing and replay the sequence. Your placement, entrances, colors, and custom drift start stay as you set them.</p>
            <Button variant="ghost" size="sm" disabled={!timingBeforePreset} onclick={undoTimingPreset}><RotateCcw size={12} /> Undo timing preset</Button>
          </div>
          <p class="control-note">Suggested rhythm: pylons → background &amp; first ring → second ring &amp; frame → Meat Proxy → reviewer &amp; caption. One beat to breathe, then LGTM.</p>
          <details class="timing-landings"><summary>Landing times</summary><p class="control-note">Times show landing impact, or fade completion. Click to preview.</p><div role="group" aria-label="Landing times">{#each landings as landing}<Button variant="ghost" size="sm" aria-label={`Preview ${splash2Artwork[landing.name].label} landing`} onclick={() => seek(landing.at)}><span>{splash2Artwork[landing.name].label}</span><small>{(landing.at / 1000).toFixed(2)}s</small></Button>{/each}</div></details>
          <p class="control-note">Set each cue and the time it takes to land. Cue times are relative to Artwork starts in the Audio tab. Shorter entrances make the hits sharper.</p>
          {#each splash2LayerNames as name, index}<div class="control-section"><h2><span class="layer-dot" style:background={splash2Artwork[name].color}></span>{splash2Artwork[name].label}<span class="index">{String(index + 1).padStart(2, '0')}</span></h2>
            {@render timingField(`${splash2Artwork[name].label} start`, `${name}At`)}{@render timingField(`${splash2Artwork[name].label} duration`, `${name}Duration`)}
          </div>{/each}
          <div class="control-section"><h2>AFTER THE VERDICT</h2>{@render timingField('Final hold', 'hold')}{@render timingField('Loop black gap', 'loopGap')}</div>
        </Tabs.Content>
        <Tabs.Content value="placement" class="inspector-body">
          <div class="control-section"><h2>CHOOSE A LAYER</h2><div class="layer-selector">{#each splash2LayerNames as name}<Button variant="outline" size="sm" aria-pressed={selected === name} onclick={() => selected = name}>{splash2Artwork[name].label}</Button>{/each}</div></div>
          <div class="control-section"><h2>{splash2Artwork[selected].label}<Button variant="ghost" size="xs" onclick={() => seek(durations.assembled)}>Show final frame</Button></h2>
            {@render numberField('Horizontal position', currentLayer.x, value => currentLayer.x = value, -100, 100, .1, '%')}
            {@render numberField('Vertical position', currentLayer.y, value => currentLayer.y = value, -100, 100, .1, '%')}
            {@render numberField('Layer scale', currentLayer.scale, value => currentLayer.scale = value, .05, 4, .01, '×')}
            {@render numberField('Layer rotation', currentLayer.rotation, value => currentLayer.rotation = value, -180, 180, .5, '°')}
            <p class="control-note">Offsets use the composition canvas. Artwork keeps its proportions and transparent margins.</p>
            <Button variant="ghost" size="sm" onclick={() => config.layers[selected] = { ...defaultSplash2Config.layers[selected] }}><RotateCcw size={12} /> Reset this layer</Button>
          </div>
          <div class="control-section"><h2>VISIBILITY</h2>{#each splash2LayerNames as name}<div class="visibility-control"><Label for={`splash2-visible-${name}`}>{splash2Artwork[name].label}</Label><Switch id={`splash2-visible-${name}`} size="sm" checked={!hiddenLayers.includes(name)} onCheckedChange={() => toggleLayer(name)} aria-label={`Show ${splash2Artwork[name].label}`} /></div>{/each}</div>
        </Tabs.Content>
        <Tabs.Content value="motion" class="inspector-body">
          <div class="control-section"><h2>CHOOSE A LAYER</h2><div class="layer-selector" role="group" aria-label="Motion selection">
            <Button variant="outline" size="sm" aria-pressed={motionGroup === 'structure'} onclick={() => motionGroup = 'structure'}>Pylons &amp; rings</Button>
            <Button variant="outline" size="sm" aria-pressed={motionGroup === 'title'} onclick={() => motionGroup = 'title'}>Frame &amp; title</Button>
            {#each splash2LayerNames as name}<Button variant="outline" size="sm" aria-pressed={!motionGroup && selected === name} onclick={() => { selected = name; motionGroup = null; }}>{splash2Artwork[name].label}</Button>{/each}
          </div>{#if motionGroup}<p class="control-note">{motionGroup === 'structure' ? 'Left pylon, right pylon, first ring, and second ring share one drift.' : 'Main frame, Meat Proxy, and Hostile Review share one drift.'} This group edits drift only.</p>{/if}</div>
          {#if !motionGroup}
          <div class="control-section"><h2>{splash2Artwork[selected].label}</h2><div class="entrance-picker" role="group" aria-label="Entrance direction">{#each splash2Entrances as entrance}<Button size="sm" variant="outline" aria-pressed={currentMotion.entrance === entrance} onclick={() => currentMotion.entrance = entrance}>{entrance}</Button>{/each}</div>
            {@render numberField('Entrance distance', currentMotion.distance, value => currentMotion.distance = value, 0, 200, 1, '%')}
            {@render numberField('Stamp punch', currentMotion.punch, value => currentMotion.punch = value, 1, 5, .05, '×')}
            <p class="control-note">Distance sets how far a slide travels. Punch sets the starting size of a stamp.</p>
          </div>
          {/if}
          <div class="control-section"><h2>{driftLabels[driftPart]} · DRIFT</h2>
            {@render numberField('Horizontal drift', currentDrift.x, value => currentDrift.x = value, -10, 10, .01, '%/s')}
            {@render numberField('Vertical drift', currentDrift.y, value => currentDrift.y = value, -10, 10, .01, '%/s')}
            <p class="control-note">Positive moves right or down; negative moves left or up. Zero keeps it fixed.{#if driftPart === 'structure' || driftPart === 'title'} All pieces of this group stay linked, including when editing one of its layers.{/if}</p>
            <Button variant="ghost" size="sm" onclick={() => { currentDrift.x = 0; currentDrift.y = 0; }}><RotateCcw size={12} /> Reset this drift</Button>
          </div>
          <div class="control-section"><h2>WHEN DRIFT STARTS</h2><div class="layer-selector" role="group" aria-label="Drift start mode">
            <Button variant="outline" size="sm" aria-pressed={config.drift.start === 'assembled'} onclick={() => config.drift.start = 'assembled'}>Artwork ready</Button>
            <Button variant="outline" size="sm" aria-pressed={config.drift.start === 'time'} onclick={() => customDriftStart(driftStart)}>Custom time</Button>
          </div>
            {#if config.drift.start === 'time'}{@render numberField('Drift start', config.drift.at, value => config.drift.at = value, 0, 60000, 10, 'ms')}{/if}
            <p class="control-note">All drifting parts share this clock.{config.drift.start === 'assembled' ? ' Starts when every piece except LGTM has fully settled; follows your timing edits.' : ' Custom time can start drift while an entrance is still playing.'} Starts at {(driftStart / 1000).toFixed(2)}s.</p>
            <div class="layer-selector"><Button variant="outline" size="sm" onclick={() => customDriftStart(splash2ReviewerLandsAt(config) - 150)}>Before reviewer lands</Button><Button variant="ghost" size="sm" onclick={() => seek(driftStart)}>Preview drift start</Button></div>
          </div>
          <div class="control-section"><h2>DRIFT PRESETS</h2><div class="preset-buttons" role="group" aria-label="Drift presets">
            {#each driftPresets as preset}<Button variant="outline" aria-label={preset.name} aria-pressed={splash2DriftPartNames.every(part => config.drift.parts[part].x === preset.parts[part].x && config.drift.parts[part].y === preset.parts[part].y)} onclick={() => applyDriftPreset(config, preset.parts)}><span>{preset.name}</span><small>{preset.hint}</small></Button>{/each}
          </div><p class="control-note">Presets change drift speeds only. Your start time, entrances, positioning, and colors stay as authored. LGTM stays fixed in every preset.</p>
            <table class="drift-rates" aria-label="Drift speeds"><thead><tr><th>Part</th><th>X %/s</th><th>Y %/s</th></tr></thead><tbody>{#each splash2DriftPartNames as part}<tr><th>{driftLabels[part]}</th><td>{config.drift.parts[part].x.toFixed(2)}</td><td>{config.drift.parts[part].y.toFixed(2)}</td></tr>{/each}</tbody></table>
          </div>
          {#if !motionGroup}
          <div class="control-section"><h2>IMPACT</h2>{@render numberField('Impact shake', config.impact, value => config.impact = value, 0, 5, .02, '%')}</div>
          <div class="control-section"><h2>WATERFRONT</h2><div class="visibility-control"><Label for="splash2-scene">Show landscape</Label><Switch id="splash2-scene" size="sm" bind:checked={config.scene.enabled} /></div>
            {@render numberField('Travel speed', config.scene.speed, value => config.scene.speed = value, -200, 200, 1, 'u/s')}
            {@render numberField('Scene brightness', config.scene.opacity, value => config.scene.opacity = value, 0, 1, .05, '×')}
            {@render numberField('Scene fade in', config.scene.fadeInMs, value => config.scene.fadeInMs = value)}
            {@render numberField('Scene fade out', config.scene.fadeOutMs, value => config.scene.fadeOutMs = value)}
          </div>
          {/if}
        </Tabs.Content>
        <Tabs.Content value="color" class="inspector-body">
          <p class="control-note">Tune colors in the composition. Save config keeps your colors, placement, and timing together.</p>
          <div class="control-section"><h2>ADJUST</h2><div class="layer-selector" role="group" aria-label="Color scope">
            <Button variant="outline" size="sm" aria-pressed={colorScope === 'all'} onclick={() => colorScope = 'all'}>All layers</Button>
            {#each splash2LayerNames as name}<Button variant="outline" size="sm" aria-pressed={colorScope === name} onclick={() => colorScope = name}>{splash2Artwork[name].label}</Button>{/each}
          </div><p class="control-note">{colorScope === 'all' ? 'Each change sets that control across all layers. Mixed values show where layers differ.' : colorScope === 'dude' ? 'Reviewer colors apply to both portrait versions.' : `Adjust ${splash2Artwork[colorScope].label} independently.`}</p></div>
          <div class="control-section"><h2>LOOK PRESETS</h2><div class="layer-selector" role="group" aria-label="Color presets">{#each Object.entries(colorPresets) as [name, grade]}<Button variant="outline" size="sm" onclick={() => applyColorPreset(grade)}>{name}</Button>{/each}</div></div>
          <div class="control-section"><h2>{colorScope === 'all' ? 'ALL LAYERS' : splash2Artwork[colorScope].label}</h2>
            {#each controls as control}
              {@const key = control.key as keyof Splash2ColorGrade}
              <div class="color-control">
                <label for={`splash-color-${key}`}>{control.label}{#if colorMixed(key)}<span>Mixed</span>{/if}</label>
                <Input id={`splash-color-${key}`} aria-label={control.label} type="number" min={control.min} max={control.max} step={control.step} value={colorMixed(key) ? '' : colorValue(key)} placeholder={colorMixed(key) ? 'Mixed' : undefined}
                  oninput={event => { const input = event.currentTarget; if (input.value !== '' && Number.isFinite(input.valueAsNumber)) changeColor(key, Math.max(control.min, Math.min(control.max, input.valueAsNumber))); }} />
                <Slider type="single" min={control.min} max={control.max} step={control.step} value={colorValue(key)} thumbLabel={control.label} onValueChange={value => changeColor(key, value)} />
                <small>{control.hint}</small>
              </div>
            {/each}
            <Button variant="ghost" size="sm" onclick={() => applyColorPreset(neutralSplash2Grade)}><RotateCcw size={12} /> Reset colors for {colorScope === 'all' ? 'all layers' : 'this layer'}</Button>
          </div>
          <p class="control-note">When the look is ready, click Save config and ask to bake the saved Splash 2 colors into the final PNGs and WebPs. Export config also includes the color recipe.</p>
        </Tabs.Content>
        <Tabs.Content value="audio" class="inspector-body">
          <div class="control-section"><h2>OPENING TIMELINE</h2>
            {@render numberField('Artwork starts', config.openingDelay, value => config.openingDelay = value, 0, 300000, 10, 'ms')}
            <p class="control-note">Audio and the landscape start when the opening is ready. Delay the entire artwork rhythm to match a musical cue. Your layer timing and drift remain relative to the artwork start.</p>
            <p class="control-note">The game loads in the background as soon as the intro starts. Handoff is at {(durations.complete / 1000).toFixed(2)}s, once the game is ready.</p>
            {@render numberField('Skip destination', splash2SkipTime(config), value => config.skipTo = value, 0, config.openingDelay, 10, 'ms')}
            <div class="actions"><Button variant="outline" size="sm" disabled={time > config.openingDelay} onclick={() => config.skipTo = time}>Use playhead</Button><Button variant="outline" size="sm" disabled={!stageReady || !audioReady || colorBusy || prefersReducedMotion.current || time >= splash2SkipTime(config)} onclick={previewSkip}>Preview skip</Button></div>
            <p class="control-note">Skip jumps the audio and title to this point, then plays normally. The landscape keeps driving from its current position. The destination stays before the artwork starts, so the full reveal is always shown. Save config stores this cue.</p>
            {#if audioError}<p class="control-note audio-error" role="status">{audioError}</p>{/if}
          </div>
            <div class="control-section"><h2>OPENING AUDIO<small>{audioDuration ? `${(audioDuration / 1000).toFixed(2)}s` : ''}</small></h2>
              <div class="visibility-control"><Label for="splash-audio-enabled">Enable opening audio</Label><Switch id="splash-audio-enabled" size="sm" bind:checked={config.audio.enabled} /></div>
              <Label for="splash-audio-file">Audio file</Label>
              <Input id="splash-audio-file" class="audio-file" aria-label="Audio file" value={config.audio.url} onchange={event => { if (event.currentTarget.value.trim()) config.audio.url = event.currentTarget.value.trim(); }} />
              {@render numberField('Audio starts', config.audio.at, value => config.audio.at = value, 0, 300000, 10, 'ms')}
              {@render numberField('Source offset', config.audio.offset, value => config.audio.offset = value, 0, 300000, 10, 'ms')}
              {@render numberField('Audio volume', config.audio.volume, value => config.audio.volume = value, 0, 1, .01, '×')}
              {@render numberField('Fade in', config.audio.fadeIn, value => config.audio.fadeIn = value, 0, 60000, 10, 'ms')}
              <label class="audio-end-label" for="splash-audio-end">Fade out relative to</label>
              <select id="splash-audio-end" class="audio-ending" aria-label="Fade out relative to" bind:value={config.audio.end}>
                <option value="clip">End of clip</option><option value="time">Opening timeline</option><option value="handoff">Game handoff</option><option value="game">Playable gameplay</option>
              </select>
              {#if config.audio.end !== 'clip'}{@render numberField(config.audio.end === 'time' ? 'Fade out starts' : 'Delay after ' + (config.audio.end === 'game' ? 'gameplay' : 'handoff'), config.audio.endAt, value => config.audio.endAt = value, 0, 300000, 10, 'ms')}{/if}
              {@render numberField('Fade out length', config.audio.fadeOut, value => config.audio.fadeOut = value, 0, 60000, 10, 'ms')}
              <Button variant="ghost" size="sm" onclick={() => seek(config.audio.at)}>Preview audio start</Button>
            </div>
          <p class="control-note">The opening recording preloads with the artwork and follows game volume. It ends naturally if it is shorter than the selected fade-out time. Save config keeps the file path and audio settings.</p>
        </Tabs.Content>
        <Tabs.Content value="subtitles" class="inspector-body">
          <SubtitleEditor value={config.subtitles} audio={config.audio} {time} onchange={value => config.subtitles = value} onseek={seek} onplay={value => { seek(value); paused = false; }} unsaved={JSON.stringify(config.subtitles) !== savedSubtitles} />
        </Tabs.Content>
        <Tabs.Content value="handoff" class="inspector-body">
          <div class="control-section"><h2>INTO THE ARENA</h2>
            <div class="visibility-control"><Label for="combat-introduction">First-visit combat introduction</Label><Switch id="combat-introduction" size="sm" bind:checked={config.introduction.enabled} /></div>
            <p class="control-note">On a first Pages visit, raise the HUD, draw both flak cannons, destroy the example file, restore the regular loadout, then open First Steps. Reduced motion skips the demonstration.</p>
            {@render numberField('Artwork exit', config.introduction.exitMs, value => config.introduction.exitMs = value, 100, 3000, 10, 'ms')}
            {@render numberField('Upward travel', config.introduction.exitDistance, value => config.introduction.exitDistance = value, 50, 250, 1, '%')}
            {@render numberField('HUD entrance', config.introduction.entranceMs, value => config.introduction.entranceMs = value, 100, 2000, 10, 'ms')}
            {@render numberField('Target shooting duration', config.introduction.firingMs, value => config.introduction.firingMs = value, 1000, 8000, 50, 'ms')}
            <p class="control-note">Damage per hit is calibrated to both cannons’ firing rate. The handoff waits for zero health and file completion; missed shots can extend it.</p>
            {@render numberField('Music fade after completion', config.introduction.musicFadeMs, value => config.introduction.musicFadeMs = value, 100, 3000, 10, 'ms')}
            <Button variant="outline" size="sm" onclick={() => { seek(durations.complete); paused = false; }}>Preview upward exit</Button>
          </div>
          <div class="control-section"><h2>FULL GAME PREVIEW</h2>
            <Label for="intro-pages-url">Pages dev / preview URL</Label>
            <Input id="intro-pages-url" bind:value={pagesUrl} />
            <Button onclick={previewHandoff}>Preview game handoff <ArrowUpRight size={14} /></Button>
            <p class="control-note">Start Pages with npm run dev:pages, or build:pages and preview:pages, and enter its URL. This opens the real game with your unsaved timings and skips to the musical cue once assets are ready. Each preview uses a fresh temporary review; your saved demo progress and tutorial preference stay untouched.</p>
            <p class="control-note">Save config keeps these cues for the next build. The scene continues driving when the audio jumps to the cue.</p>
          </div>
        </Tabs.Content>
        <div class="inspector-footer">{prefersReducedMotion.current ? 'Reduced motion · still frame, no looping' : 'Live preview · save or export to keep changes'}</div>
      </Tabs.Root>
    </div>
    <section class="layer-strip" aria-label="Source layers">
      {#each splash2LayerNames as name}<div class="source-layer" class:muted={hiddenLayers.includes(name)}>
        <Button variant="ghost" class="source-select" aria-label={`Edit ${splash2Artwork[name].label} placement`} onclick={() => edit(name)}><div class="thumbnail"><img src={name === 'dude' ? splash2Portraits[config.portrait].src : splash2Artwork[name].src} alt="" /></div><span>{splash2Artwork[name].label}</span></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`${hiddenLayers.includes(name) ? 'Reveal' : 'Hide'} ${splash2Artwork[name].label} layer`} aria-pressed={!hiddenLayers.includes(name)} onclick={() => toggleLayer(name)}>{#if hiddenLayers.includes(name)}<EyeOff size={14} />{:else}<Eye size={14} />{/if}</Button>
      </div>{/each}
    </section>
    <footer><span>Meat Proxy <i>/</i> SPLASH WORKBENCH</span><span role="status">{cycles.toString().padStart(2, '0')} PLAYS <i>·</i> {message || 'HOSTILE REVIEW'}</span></footer>
  </main>
</div>

<style>
  .splash2-lab { --line: var(--tint-c6c9b71b); min-height: 100dvh; background: var(--tint-111411); color: var(--tint-dcdfd3); font: 12px var(--ui, sans-serif); }
  .splash2-lab :global(button) { cursor: pointer; }
  .splash2-lab :global([data-slot='tabs-content'][hidden]) { display: none; }
  .lab-header { min-height: 64px; padding: 12px 34px; display: flex; align-items: center; gap: 28px; border-bottom: 1px solid var(--line); background: var(--tint-161a15); }
  .brand { display: flex; align-items: center; gap: 10px; color: var(--tint-e3dfcd); }
  .brand > span { font: 800 26px var(--hud-font); letter-spacing: .04em; }
  .brand > span > span { color: #b5916f; margin: 0 3px; }
  .header-path, .overline { font: 8px var(--mono); letter-spacing: .1em; color: var(--tint-aeb59f); }
  .header-path { border-left: 1px solid var(--line); padding-left: 26px; }
  i { font-style: normal; margin: 0 10px; opacity: .5; }
  nav { display: flex; gap: 18px; margin-left: auto; }
  nav a { padding: 7px 0; color: var(--tint-8e9a85); }
  nav a.active { color: #ddc4a3; border-bottom: 1px solid #d5a276; }
  .landscape-link { display: flex; align-items: center; gap: 8px; color: var(--tint-a1ad93); font-size: 11px; }
  main { max-width: 1800px; margin: auto; padding: 32px 34px 0; }
  .heading { display: flex; justify-content: space-between; align-items: end; gap: 20px; margin-bottom: 26px; }
  .overline { margin-bottom: 9px; } .overline span { color: #dd9d6d; margin-left: 10px; }
  h1 { font: 500 32px/1.2 var(--ui); letter-spacing: -.045em; color: var(--tint-e7e8de); } h1 > span { color: #df9b68; }
  .heading p { color: var(--tint-8e9a85); margin-top: 8px; } .actions { display: flex; gap: 8px; }
  .workspace { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 20px; align-items: start; }
  .workspace :global(.preview), .workspace :global(.inspector) { display: block; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; min-width: 0; }
  .preview-toolbar { height: 44px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; background: var(--tint-1a2019); }
  .preview-tools { display: flex; align-items: center; gap: 16px; } .preview-tools > span { font: 8px var(--mono); color: var(--tint-7d8a72); }
  .stage { position: relative; height: clamp(360px, 38vw, 580px); overflow: hidden; background: #080908; }
  .stage :global(.sequence-view), .stage :global(.reference-view) { position: absolute; inset: 0; }
  .stage:fullscreen { height: 100dvh; width: 100dvw; } .stage:fullscreen .stage-corner { display: none; }
  .stage :global(.reference-view) { display: grid; place-items: center; padding: 54px 30px 38px; }
  .stage :global(.reference-view img) { width: 100%; height: 100%; object-fit: contain; min-height: 0; }
  .stage :global(.reference-view > span) { position: absolute; bottom: 17px; font: 8px var(--mono); color: #ac9b86; }
  .stage-corner { position: absolute; left: 18px; top: 18px; pointer-events: none; font: 7px var(--mono); letter-spacing: .1em; color: #98978a; }
  .color-preview-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 12px; border-top: 1px solid var(--line); background: var(--tint-1b2019); }
  .color-preview-toolbar > div { display: flex; gap: 3px; }
  .color-preview-toolbar :global(button) { height: 26px; font-size: 10px; }
  .color-preview-toolbar > span { font-size: 9px; color: var(--tint-8e9a85); text-align: right; }
  .color-preview-toolbar > span.error { color: #ec9a85; }
  .transport { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--tint-1b2019); border-block: 1px solid var(--line); }
  .transport :global(.play) { width: 31px; height: 31px; padding: 7px; background: #d6ab7d; color: #25251c; border-radius: 50%; flex-shrink: 0; }
  .timecode { display: flex; align-items: baseline; gap: 8px; font-family: var(--mono); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .timecode strong { font-weight: 400; font-size: 17px; color: #ddc4a3; min-width: 64px; } .timecode small { font-size: 10px; margin-left: 3px; } .timecode > span { font-size: 9px; opacity: .5; }
  .phase { font-size: 9px; color: var(--tint-9aab88); } .transport :global(.final-frame) { margin-left: auto; font-size: 10px; white-space: nowrap; }
  .loop-toggle { display: flex; align-items: center; gap: 7px; padding-left: 12px; border-left: 1px solid var(--line); } .loop-toggle :global(label) { font-size: 10px; }
  .timeline { padding: 17px 19px 12px; background: var(--tint-141a14); }
  .timeline-heading, .timeline-scale { display: flex; justify-content: space-between; font: 7px var(--mono); color: var(--tint-a1ae91); }
  .timeline :global(.scrubber) { margin: 17px 0 12px 116px; width: calc(100% - 116px); }
  .tracks { position: relative; } .playhead { position: absolute; top: 0; bottom: 0; z-index: 2; width: 1px; background: #efc39980; pointer-events: none; }
  .track { display: grid; grid-template-columns: 116px 1fr; align-items: center; height: 26px; }
  .track > :global(button) { justify-content: flex-start; gap: 8px; height: auto; padding: 5px 0; font-size: 9px; font-weight: 400; color: var(--tint-96a488); }
  .track > :global(button > span) { font: 7px var(--mono); opacity: .5; } .track > :global(button.selected) { color: #dbc7a3; }
  .track-bed { height: 19px; position: relative; overflow: hidden; background: repeating-linear-gradient(90deg, #849c700d 0 1px, transparent 1px 25%), #0c130d; }
  .track-bed :global(.clip) { position: absolute; top: 0; height: 100%; min-width: 2px; padding: 0 4px; justify-content: start; overflow: hidden; border-left: 2px solid var(--clip-color); border-radius: 2px; background: color-mix(in srgb, var(--clip-color) 22%, transparent); color: var(--clip-color); font: 6px var(--mono); }
  .timeline-scale { margin: 10px 0 0 116px; opacity: .65; }
  .inspector-heading { height: 44px; padding: 0 12px 0 16px; display: flex; align-items: center; justify-content: space-between; background: var(--tint-1a2019); }
  .inspector-heading > span { display: flex; gap: 8px; align-items: center; font: 8px var(--mono); letter-spacing: .09em; }
  .portrait-section { padding: 15px; border-bottom: 1px solid var(--line); } .portrait-section h2 { margin-bottom: 10px; }
  .portrait-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
  .portrait-picker :global(button) { height: auto; min-width: 0; padding: 4px; display: flex; flex-direction: column; gap: 5px; font-size: 8px; }
  .portrait-picker :global(button.active) { border-color: #d5a276; background: #d5a27618; } .portrait-picker img { width: 100%; aspect-ratio: 1; object-fit: cover; background: #080908; }
  .workspace :global(.inspector-tabs) { display: flex; flex-wrap: wrap; height: auto; width: 100%; border-radius: 0; padding: 7px; } .workspace :global(.inspector-tabs > button) { flex: 1; font-size: 10px; }
  .workspace :global(.inspector-body) { max-height: 630px; overflow-y: auto; padding: 17px; scrollbar-width: thin; }
  h2 { display: flex; align-items: center; gap: 7px; font: 9px var(--mono); color: var(--tint-c4c7b4); } h2 > :global(button) { margin-left: auto; font-size: 9px; }
  .index { margin-left: auto; font-size: 7px; opacity: .5; } .layer-dot { width: 5px; height: 5px; border-radius: 50%; }
  .control-section { padding: 15px 0; border-bottom: 1px solid var(--line); } .control-section h2 { margin-bottom: 12px; }
  .number-control { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 9px 0; color: var(--tint-9aab88); font-size: 10px; }
  .number-wrap { display: flex; align-items: center; gap: 7px; } .number-wrap :global(input) { width: 85px; height: 29px; padding: 4px 6px; font: 10px var(--mono); } .number-wrap small { min-width: 22px; color: var(--tint-748669); font-size: 9px; }
  .control-note { color: var(--tint-8e9a85); font-size: 10px; line-height: 1.65; margin: 8px 0; }
  .audio-error { color: #ec9a85; }
  .control-section h2 > small { margin-left: auto; font: 9px var(--mono); color: var(--tint-8e9a85); }
  .workspace :global(.audio-file) { margin: 7px 0 12px; font: 10px var(--mono); height: 32px; }
  .audio-end-label { display: block; margin: 12px 0 7px; font-size: 10px; color: var(--tint-9aab88); }
  .audio-ending { width: 100%; border: 1px solid var(--line); border-radius: 4px; padding: 7px; font-size: 11px; background: #101710; color: #dcdfd3; }
  .preset-buttons { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .preset-buttons :global(button) { height: auto; padding: 9px 10px; display: flex; flex-direction: column; align-items: start; gap: 4px; text-align: left; }
  .preset-buttons :global(button[aria-pressed='true']) { border-color: #d5a276; background: #d5a27618; }
  .preset-buttons small { font-size: 9px; color: var(--tint-8e9a85); white-space: normal; }
  .timing-landings { border-bottom: 1px solid var(--line); padding: 12px 0; }
  .timing-landings summary { cursor: pointer; color: var(--tint-c4c7b4); font-size: 10px; }
  .timing-landings :global(button) { display: flex; justify-content: space-between; width: 100%; font-size: 10px; }
  .timing-landings small { font: 9px var(--mono); color: #ddc4a3; }
  .drift-rates { width: 100%; margin-top: 13px; font-size: 9px; border-collapse: collapse; }
  .drift-rates th, .drift-rates td { padding: 6px 0; border-bottom: 1px solid var(--line); text-align: right; }
  .drift-rates th:first-child { text-align: left; font-weight: 400; }
  .drift-rates td { font-family: var(--mono); color: #ddc4a3; }
  .color-control { display: grid; grid-template-columns: minmax(0, 1fr) 72px; gap: 10px; margin: 18px 0; }
  .color-control label { align-self: center; color: var(--tint-c4c7b4); font-size: 10px; }
  .color-control label > span { margin-left: 6px; color: #ddc4a3; font-size: 8px; }
  .color-control :global(input) { height: 28px; padding: 4px 6px; font: 10px var(--mono); }
  .color-control :global([data-slot='slider']), .color-control small { grid-column: 1 / -1; }
  .color-control small { font-size: 9px; color: var(--tint-8e9a85); }
  .layer-selector, .entrance-picker { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 15px; }
  .layer-selector :global(button), .entrance-picker :global(button) { font-size: 9px; height: 27px; } .layer-selector :global(button[aria-pressed='true']), .entrance-picker :global(button[aria-pressed='true']) { border-color: #d5a276; color: #ddc4a3; background: #d5a27618; }
  .visibility-control { display: flex; align-items: center; justify-content: space-between; margin: 13px 0; } .visibility-control :global(label) { font-size: 10px; }
  .inspector-footer { padding: 12px 15px; border-top: 1px solid var(--line); font-size: 9px; color: var(--tint-9aab88); }
  .layer-strip { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-top: 20px; }
  .source-layer { display: flex; align-items: center; border: 1px solid var(--line); border-radius: 3px; min-width: 0; } .source-layer.muted { opacity: .4; }
  .source-layer :global(.source-select) { display: flex; justify-content: start; flex: 1; min-width: 0; height: 64px; padding: 8px; gap: 8px; font-size: 9px; }
  .thumbnail { width: 52px; height: 42px; background: #080908; flex-shrink: 0; } .thumbnail img { width: 100%; height: 100%; object-fit: contain; }
  footer { display: flex; justify-content: space-between; gap: 15px; padding: 24px 0; font: 7px var(--mono); color: var(--tint-748669); }
  @media (max-width: 1100px) { .lab-header { gap: 16px; } .header-path { display: none; } .layer-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); } .phase { display: none; } }
  @media (max-width: 850px) { .workspace { grid-template-columns: minmax(0, 1fr); } .workspace :global(.inspector-body) { max-height: 500px; } .portrait-picker { max-width: 360px; } .stage { height: 54vw; min-height: 280px; } .landscape-link { display: none; } .layer-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 560px) { main { padding: 24px 12px 0; } .lab-header { padding: 12px; gap: 12px; } nav { gap: 12px; font-size: 10px; } .heading { align-items: start; flex-direction: column; gap: 16px; } h1 { font-size: 28px; } .transport { gap: 6px; padding: 10px 7px; } .timecode { gap: 4px; } .timecode strong { min-width: 48px; font-size: 14px; } .transport :global(.final-frame) { padding: 4px; font-size: 8px; } .loop-toggle { padding-left: 6px; gap: 5px; } .preview-tools > span { display: none; } .timeline { padding-inline: 12px; } .layer-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } footer { flex-wrap: wrap; } }
</style>
