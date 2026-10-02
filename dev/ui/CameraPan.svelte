<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { Pause, Play, RotateCcw, SkipBack, SkipForward } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import TimelineScrubber from './TimelineScrubber.svelte';
  import SplashLandscape from '$lib/components/splash/SplashLandscape.svelte';
  import type { LandscapeConfig } from '$lib/components/splash/landscape-config';
  import { sequenceShots } from '$lib/components/splash/sequence-math';
  import SequenceMap from './SequenceMap.svelte';

  let { settings, active = true, controls }: { settings: LandscapeConfig; active?: boolean; controls: Snippet } = $props();
  let time = $state(0), paused = $state(true), rate = $state(1), width = $state(960), height = $state(540);
  let shots = $derived(sequenceShots(settings).map(shot => shot.id === 'hold' ? { ...shot,
    end: Math.max(shot.end, ...settings.lightning.cues.map(cue => (cue.timeMs + settings.lightning.duration * 1050) / 1000))
  } : shot));
  let duration = $derived(shots.at(-1)!.end);
  let current = $derived(shots.find(shot => time < shot.end) ?? shots.at(-1)!);
  let reload = $state(0);
  function seek(value: number) { paused = true; time = prefersReducedMotion.current ? 0 : Math.max(0, value); }
  function play() { if (time >= duration) time = 0; paused = !paused; }
  $effect(() => { if (!active) paused = true; });
  $effect(() => { if (prefersReducedMotion.current) { paused = true; time = 0; } });
  onMount(() => {
    const query = new URLSearchParams(location.search).get('t');
    if (query && Number.isFinite(Number(query))) seek(Number(query));
    let request = 0, previous = 0;
    function tick(now: number) {
      const delta = previous ? Math.min(100, now - previous) : 0;
      previous = now;
      if (active && !paused && !document.hidden && !prefersReducedMotion.current) {
        time = Math.min(duration, time + delta / 1000 * rate);
        if (time >= duration) paused = true;
      }
      request = requestAnimationFrame(tick);
    }
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  });
</script>

<div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
  <section class="min-w-0" aria-label="Camera pan preview">
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="font-(family-name:--hud-font) text-2xl font-semibold">Camera pan</h2>
      <span class="font-mono text-[10px] text-muted-foreground">{settings.sequence.enabled ? 'DRIVING EDIT · ARRANGE BEATS IN SEQUENCE' : 'GLIDE → SLOW DOWN → HOLD'}</span>
    </div>
    <div class="relative aspect-video overflow-hidden rounded-lg border border-border bg-black" data-camera-stage bind:clientWidth={width} bind:clientHeight={height}>
      {#if active}{#key reload}
        <SplashLandscape {settings} preview time={time * 1000} {paused} reducedMotion={prefersReducedMotion.current} />
      {/key}{/if}
      <span class="pointer-events-none absolute bottom-3 left-3 rounded bg-black/70 px-2 py-1 text-[11px] text-white/70">{prefersReducedMotion.current ? 'Reduced motion · final still' : current.name}</span>
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon-sm" aria-label="Replay camera pan" disabled={prefersReducedMotion.current} onclick={() => { time = 0; paused = false; }}><RotateCcw class="size-4" /></Button>
      <Button variant="outline" size="icon-sm" aria-label="Previous frame" disabled={prefersReducedMotion.current} onclick={() => seek(time - 1/30)}><SkipBack class="size-4" /></Button>
      <Button size="icon-sm" aria-label={paused ? 'Play camera pan' : 'Pause camera pan'} disabled={prefersReducedMotion.current} onclick={play}>{#if paused}<Play class="size-4" />{:else}<Pause class="size-4" />{/if}</Button>
      <Button variant="outline" size="icon-sm" aria-label="Next frame" disabled={prefersReducedMotion.current} onclick={() => seek(time + 1/30)}><SkipForward class="size-4" /></Button>
      <Input class="h-8 w-24 font-mono text-xs" type="number" aria-label="Playhead seconds" min="0" step="0.033333" value={Number(time.toFixed(3))} onchange={event => { if (Number.isFinite(event.currentTarget.valueAsNumber)) seek(event.currentTarget.valueAsNumber); }} />
      <span class="text-xs text-muted-foreground">seconds</span>
      <select aria-label="Playback rate" bind:value={rate} class="ml-auto h-8 rounded-md border border-input bg-background px-2 text-xs"><option value={0.5}>½ speed</option><option value={1}>Normal speed</option><option value={2}>2× speed</option></select>
    </div>
    <div class="mt-4"><TimelineScrubber label="Camera playhead" max={duration} step={1/30} value={Math.min(time, duration)} onseek={seek} /></div>
    <div class="mt-4 grid grid-cols-3 gap-2">
      {#each shots as shot, i}
        <button type="button" aria-label={`Shot ${i+1}: ${shot.name}`} aria-pressed={current.id===shot.id} class="rounded-md border border-border bg-card/35 p-3 text-left aria-pressed:border-primary/60 aria-pressed:bg-primary/5" onclick={() => seek(shot.start)}>
          <span class="block font-mono text-[10px] text-primary">0{i+1} · {shot.start.toFixed(1)}s</span>
          <span class="mt-1 block text-xs font-medium">{shot.name}</span>
        </button>
      {/each}
    </div>
    <p class="mt-3 text-xs leading-relaxed text-muted-foreground">{current.description} The timeline includes at least five seconds of the final hold and extends to the last lightning cue; the splash stays there indefinitely.</p>
    <div class="mt-5"><SequenceMap landscape={settings} {time} aspect={width / Math.max(1, height)} {shots} onseek={seek} /></div>
    <Button variant="ghost" class="mt-3 text-xs" onclick={() => reload++}><RotateCcw class="size-3.5" />Reload Blender models</Button>
  </section>
  <section class="min-w-0 rounded-lg border border-border bg-card/35 p-4" aria-label="Camera controls">
    <h3 class="text-sm font-medium">Pan and framing</h3>
    <p class="mt-2 mb-5 text-xs leading-relaxed text-muted-foreground">These controls also change the landscape and app splash. Use Save config above to keep them. Negative speed reverses the pan; zero shows the final framing.</p>
    <div class="grid gap-4">{@render controls()}</div>
  </section>
</div>
