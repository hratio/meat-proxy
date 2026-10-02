<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Slider } from '$lib/components/ui/slider';
  import SingleSelect from '$lib/components/SingleSelect.svelte';
  import { onMount, untrack } from 'svelte';
  import { stringify } from 'smol-toml';
  import { createWeaponAudio } from '$lib/audio';
  import { createReviewAudio } from '$lib/review-audio';
  import { audioPresets, type AudioPreset } from '$lib/weapons/samples';
  import { weaponProfiles, weaponProfileSchema } from '$lib/weapons/profiles';
  import { weaponCatalog } from '$lib/weapons/catalog';

  const groups = [{ id: 'all', label: 'All sounds' }, { id: 'automatic', label: 'Machine guns' }, { id: 'rotary', label: 'Rotary / A-10' }, { id: 'single', label: 'Single shots' }, { id: 'missile', label: 'Missiles' }, { id: 'mechanical', label: 'Keyboard' }, { id: 'effect', label: 'Effects / reloads' }];
  let filter = $state('all');
  let selected = $state('ak-47');
  let clipRole = $state('shot');
  let target = $state('ak-256');
  let volume = $state(0.18);
  let echoDelay = $state(1500);
  let useLoop = $state(true);
  let firing = $state(false);
  let ready = $state(false);
  let error = $state('');
  let copied = $state(false);
  let raw: HTMLAudioElement | undefined = $state();
  let repeat: ReturnType<typeof setInterval> | undefined;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let holdInput = false;
  const preset = $derived(audioPresets.find(item => item.id === selected)!);
  const visible = $derived(audioPresets.filter(item => filter === 'all' || item.group === filter));
  const clip = $derived(preset.clips[clipRole] || Object.values(preset.clips)[0]);
  const reviewKind = $derived(preset.id === 'bullet-flyby' ? 'erase' : preset.id === 'wood-impact' ? 'complete' : undefined);
  const profile = $derived(preset.sound ? weaponProfileSchema.parse({
    ...weaponProfiles[target], fireIntervalMs: preset.fireIntervalMs,
    sound: { ...preset.sound, ...(!useLoop ? { loop: undefined } : {}), ...(preset.sound.stopDelayMs ? { stopDelayMs: echoDelay } : {}) }
  }) : undefined);
  const toml = $derived(profile ? stringify({ weapons: { profiles: { [target]: profile } } }) : '');
  const player = createWeaponAudio(url => { error = `Could not load ${url}`; });
  const reviewPlayer = createReviewAudio(url => { error = `Could not load ${url}`; });

  function release(tail = true) {
    clearInterval(repeat); clearTimeout(releaseTimer);
    repeat = undefined; releaseTimer = undefined;
    holdInput = false; firing = false;
    player.end(0, tail);
    reviewPlayer.endErase('preview', tail);
    if (!tail) reviewPlayer.cancel();
  }
  function silence() { release(false); raw?.pause(); }

  function start(mode: 'tap' | 'burst' | 'hold') {
    if (!ready || (!profile && !reviewKind) || (mode === 'hold' && firing)) return;
    silence();
    if (reviewKind === 'complete') { reviewPlayer.complete(volume); return; }
    holdInput = mode === 'hold'; firing = true;
    if (reviewKind === 'erase') {
      reviewPlayer.beginErase('preview', volume);
      if (mode === 'tap') releaseTimer = setTimeout(() => release(), 25);
      return;
    }
    if (!profile) return;
    player.begin(0, profile, volume);
    player.shot(0);
    if (mode === 'tap') releaseTimer = setTimeout(() => release(), Math.min(25, profile.sound.loopDelayMs / 2));
    else {
      repeat = setInterval(() => player.shot(0), profile.fireIntervalMs!);
      if (mode === 'burst') releaseTimer = setTimeout(() => release(), profile.fireIntervalMs! * 3 - 5);
    }
  }

  function select(item: AudioPreset) {
    silence(); selected = item.id; clipRole = item.sound ? 'shot' : Object.keys(item.clips)[0]; copied = false;
    echoDelay = item.sound?.stopDelayMs || 1500;
  }

  async function copyProfile() {
    try {
      await navigator.clipboard.writeText(toml); copied = true;
      clearTimeout(copiedTimer); copiedTimer = setTimeout(() => copied = false, 1800);
    } catch { error = 'Clipboard unavailable. Select and copy the configuration below.'; }
  }

  $effect(() => {
    const next = profile, feedback = reviewKind;
    let cancelled = false;
    untrack(silence); ready = false; error = '';
    if (next) void player.preload([next]).then(() => { if (!cancelled) ready = true; });
    else if (feedback) void reviewPlayer.preload().then(() => { if (!cancelled) ready = true; });
    return () => { cancelled = true; player.end(0, false); reviewPlayer.cancel(); };
  });
  $effect(() => { volume; untrack(silence); });
  $effect(() => { if (raw) { raw.volume = volume; raw.loop = clipRole === 'loop'; } });

  onMount(() => {
    const releaseHold = () => { if (holdInput) release(); };
    const cancel = () => silence();
    const visibility = () => { if (document.hidden) silence(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') silence(); };
    window.addEventListener('pointerup', releaseHold);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      silence(); player.dispose(); reviewPlayer.dispose(); clearTimeout(copiedTimer);
      window.removeEventListener('pointerup', releaseHold);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape);
      document.removeEventListener('visibilitychange', visibility);
    };
  });
</script>

<svelte:head><title>Weapon audio · Meat Proxy</title><meta name="description" content="Compare weapon shots, sustained loops, delayed A-10 echoes, and effects." /></svelte:head>

<main class="audio-lab mx-auto min-h-dvh max-w-[1400px] px-[4vw] pb-6 font-sans text-foreground [&_a:hover]:text-primary">
  <header class="flex min-h-[82px] items-center justify-between gap-6 border-b border-border text-xs [&>a:first-child]:text-xl [&>a:first-child]:font-extrabold [&_span]:ml-3 [&_span]:font-mono [&_span]:text-[10px] [&_span]:tracking-widest [&_span]:text-muted-foreground max-[760px]:[&_span]:hidden"><a href="/__dev/armory">MEAT PROXY <span>/ SOUND ROOM</span></a><a href="/">Back to the arena ↗</a></header>
  <div class="flex items-center justify-between gap-10 pt-10 pb-7 [&_p]:max-w-[660px] [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-4">
    <h1 class="my-3.5 font-[family-name:var(--hud-font)] text-[clamp(36px,5vw,62px)] leading-none font-extrabold">Weapon audio</h1>
    <label class="grid min-w-40 grid-cols-[1fr_auto] gap-3 text-xs max-[760px]:w-[210px]">Volume <output class="font-mono text-xs text-primary">{Math.round(volume * 100)}%</output><Slider type="single" class="col-span-full" min={0} max={1} step={0.01} bind:value={volume} thumbLabel="Preview volume" /></label>
  </div>
  <nav class="flex flex-wrap gap-1.5 pb-5" aria-label="Sound categories">
    {#each groups as group}<Button variant="outline" selected={filter === group.id} aria-pressed={filter === group.id} onclick={() => { filter = group.id; if (group.id !== 'all' && preset.group !== group.id) select(audioPresets.find(item => item.group === group.id)!); }}>{group.label}</Button>{/each}
  </nav>
  <div class="grid grid-cols-[260px_minmax(0,1fr)] items-start gap-6 max-[760px]:grid-cols-1">
    <aside class="grid max-h-[700px] gap-1.5 overflow-auto p-px pr-2 max-[760px]:max-h-[260px] max-[760px]:grid-cols-2" aria-label="Sound candidates">
      {#each visible as item}<Button variant="outline" size="card" class="flex-col items-start" selected={item.id === selected} aria-pressed={item.id === selected} onclick={() => select(item)}><strong>{item.name}</strong><span>{Object.keys(item.clips).length} clips{item.fireIntervalMs ? ` · ${item.fireIntervalMs} ms` : ''}</span></Button>{/each}
    </aside>
    <section class="min-w-0 rounded-md border border-border bg-card p-7 max-[760px]:p-5" aria-label="Audition selected sound">
      <p class="flex items-center gap-2 text-xs leading-normal tracking-wide text-muted-foreground">{preset.group.toUpperCase()}</p><h2 class="my-3 font-[family-name:var(--hud-font)] text-[34px] font-extrabold">{preset.name}</h2>
      {#if profile || reviewKind}
        <div class="mt-6 flex flex-wrap gap-2">
          <Button variant="outline" disabled={!ready} onclick={() => start('tap')}>{reviewKind === 'complete' ? 'File complete' : reviewKind === 'erase' ? 'Erase tap' : 'Single / tap'}</Button>
          {#if profile}<Button variant="outline" disabled={!ready} onclick={() => start('burst')}>Short burst</Button>{/if}
          {#if reviewKind !== 'complete'}<Button variant="outline" selected={firing} disabled={!ready} onpointerdown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); start('hold'); }} onpointerup={() => { if (holdInput) release(); }} onpointercancel={() => release(false)} onlostpointercapture={() => { if (holdInput) release(); }} onkeydown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat) start('hold'); } }} onkeyup={event => { if (event.key === ' ' || event.key === 'Enter') release(); }} onblur={() => { if (holdInput) release(false); }}>{reviewKind === 'erase' ? 'Hold to erase' : 'Hold to fire'}</Button>{/if}
          <Button variant="outline" onclick={silence}>Stop all</Button>
        </div>
        <p class="my-3.5 min-h-4.5 text-xs leading-relaxed text-muted-foreground">{!ready ? 'Loading sounds…' : firing ? 'Playing…' : reviewKind === 'erase' ? 'Release lets the current fly-by finish.' : reviewKind === 'complete' ? 'Wood-impact effect. Completion voices are in Studio → Ad-libs.' : ''}</p>
        <div class="flex flex-wrap items-center gap-5.5 text-xs text-muted-foreground [&_label]:flex [&_label]:items-center [&_label]:gap-2">
          {#if preset.sound?.loop}<label><Checkbox bind:checked={useLoop} /> Use sustained loop</label>{/if}
          {#if preset.sound?.stopDelayMs}<label>Echo delay <Slider type="single" class="w-25" min={1000} max={2000} step={100} bind:value={echoDelay} thumbLabel="Echo delay" /><output class="font-mono text-xs text-primary">{(echoDelay / 1000).toFixed(1)} s</output></label>{/if}
        </div>
      {/if}
      {#if error}<p class="text-xs text-destructive" role="alert">{error}</p>{/if}
      <div class="mt-6 border-t border-border pt-4.5">
        <h3 class="mb-3.5 text-xs font-medium">Individual clips</h3>
        <div class="mb-4.5 flex flex-wrap gap-1.5 [&_span]:ml-1.5 [&_span]:text-muted-foreground">{#each Object.entries(preset.clips) as [role, item]}<Button variant="outline" selected={clip === item} aria-pressed={clip === item} onclick={() => { silence(); clipRole = role; }}>{role} <span>{item.durationSec.toFixed(2)} s</span></Button>{/each}</div>
        <audio class="h-[42px] w-full [color-scheme:dark]" bind:this={raw} src={clip.url} controls preload="none" onplay={() => release(false)} aria-label={`${preset.name} ${clipRole}`}></audio>
        <div class="mt-3 flex justify-end text-xs text-primary"><a href={clip.url} download>Download clip ↓</a></div>
      </div>
      {#if profile}
        <details class="mt-6 border-t border-border pt-4.5 text-xs">
          <summary class="cursor-pointer text-foreground">Use this sound on a weapon</summary>
          <div class="mt-4.5 mb-2 flex items-end gap-2.5 [&>div]:flex-1"><SingleSelect label="Weapon" bind:value={target} options={weaponCatalog.map(item => ({ value: item.id, label: item.name }))} /><Button variant="outline" onclick={copyProfile}>{copied ? 'Copied' : 'Copy TOML'}</Button></div>
          <p class="text-xs leading-relaxed text-muted-foreground">Add this block to your Meat Proxy configuration, then restart.</p>
          <pre class="max-h-80 overflow-auto rounded bg-muted p-4.5 font-mono text-xs leading-relaxed text-muted-foreground">{toml}</pre>
        </details>
      {/if}
    </section>
  </div>
  <footer class="pt-6 text-xs text-muted-foreground">Press Escape to stop.</footer>
</main>
