<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import type { Splash2Audio } from '$lib/components/splash/splash2-audio-config';
  import { subtitleSourceTime, subtitleTimelineTime, type Splash2Subtitles, type SubtitleCue, type SubtitleFont } from '$lib/components/splash/splash2-subtitles';
  let { value, audio, time, onchange, onseek, onplay, unsaved = false }: {
    value: Splash2Subtitles; audio: Splash2Audio; time: number;
    onchange: (value: Splash2Subtitles) => void; onseek: (time: number) => void;
    onplay: (time: number) => void; unsaved?: boolean;
  } = $props();
  let selected = $state('');
  let cue = $derived(value.cues.find(cue => cue.id === selected) ?? value.cues[0]);
  let sourceTime = $derived(Math.max(0, Math.min(597500, Math.round(subtitleSourceTime(time, audio, value.offsetMs)))));
  function update(patch: Partial<Splash2Subtitles>) { onchange({ ...value, ...patch }); }
  function edit(patch: Partial<SubtitleCue>) {
    if (!cue) return;
    update({ cues: value.cues.map(item => item.id === cue!.id ? { ...item, ...patch } : item).sort((a,b) => a.startMs-b.startMs) });
  }
  function moveStart(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (!cue || !Number.isFinite(input.valueAsNumber)) return;
    const duration = cue.endMs - cue.startMs;
    const startMs = Math.max(0, Math.min(600000-duration, Math.round(input.valueAsNumber)));
    edit({startMs, endMs:startMs+duration});
  }
  function delay(event: Event) {
    const n = (event.currentTarget as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(n)) update({offsetMs:Math.max(-30000,Math.min(30000,n))});
  }
  let overlap = $derived(cue && value.cues.some(other => other.id !== cue.id && other.startMs < cue.endMs && other.endMs > cue.startMs));
  function add() {
    const id = crypto.randomUUID(); selected = id;
    update({ cues: [...value.cues, { id, startMs: sourceTime, endMs: sourceTime+2500, text: 'New subtitle' }].sort((a,b) => a.startMs-b.startMs) });
  }
</script>

<div class="subtitle-editor">
  <label class="enable">Show subtitles <Switch aria-label="Show opening subtitles" checked={value.enabled} onCheckedChange={enabled => update({enabled})} /></label>
  <p class="note">Shown with sound on or muted. Lines follow the opening audio clock, including pause, trim and skip.</p>
  <label>Font<select aria-label="Subtitle font" value={value.font} onchange={event => update({font:event.currentTarget.value as SubtitleFont})}><option value="inter">Inter · clean sans</option><option value="oxanium">Oxanium · futuristic</option><option value="mono">IBM Plex Mono</option></select></label>
  <div class="fields">
    <label>Size (px)<Input aria-label="Subtitle font size" type="number" min="10" max="32" step="1" value={value.fontSize} onchange={event => update({fontSize:Math.max(10,Math.min(32,Number(event.currentTarget.value)||14))})} /></label>
    <label>Opacity (0–1)<Input aria-label="Subtitle opacity" type="number" min=".1" max="1" step=".05" value={value.opacity} onchange={event => update({opacity:Math.max(.1,Math.min(1,Number(event.currentTarget.value)||.1))})} /></label>
    <label>Letter spacing (em)<Input aria-label="Subtitle letter spacing" type="number" min="-.03" max=".2" step=".005" value={value.tracking} onchange={event => update({tracking:Math.max(-.03,Math.min(.2,Number(event.currentTarget.value)||0))})} /></label>
    <label>From bottom (%)<Input aria-label="Subtitle bottom position" type="number" min="1" max="30" step=".5" value={value.bottom} onchange={event => update({bottom:Math.max(1,Math.min(30,Number(event.currentTarget.value)||1))})} /></label>
  </div>
  <label>Text color<input aria-label="Subtitle color" type="color" value={value.color} oninput={event => update({color:event.currentTarget.value})} /></label>
  <label>Global subtitle delay (ms)<Input aria-label="Subtitle timing offset" type="number" min="-30000" max="30000" step="100" value={value.offsetMs} oninput={delay} /></label>
  <p class="note">Positive = later, negative = earlier. 1000 ms is one second. This moves every line equally and preserves each line's duration.</p>
  <div class="buttons"><Button variant="outline" size="sm" onclick={() => onplay(0)}>Replay from beginning</Button><Button variant="ghost" size="sm" onclick={() => update({offsetMs:0})}>Reset delay</Button></div>
  <p class="note" role="status">{unsaved ? 'Unsaved subtitle changes. ' : ''}Edits apply to this preview immediately. Use Save config to keep them after reload.</p>
  <h3>VOICEOVER LINES <small>{value.cues.length}</small></h3>
  <label>Selected line<select aria-label="Subtitle line" value={cue?.id ?? ''} onchange={event => selected=event.currentTarget.value}>
    {#each value.cues as item (item.id)}<option value={item.id}>{(item.startMs/1000).toFixed(2)}s · {item.text.slice(0,54)}</option>{/each}
  </select></label>
  {#if cue}
    <label>Text<textarea aria-label="Subtitle text" maxlength="240" rows="3" value={cue.text} oninput={event => edit({text:event.currentTarget.value})}></textarea></label>
    <div class="fields">
      <label>Start (ms)<Input aria-label="Subtitle starts (ms)" type="number" min="0" max={600000-(cue.endMs-cue.startMs)} step="10" value={cue.startMs} onchange={moveStart} /></label>
      <label>End (ms)<Input aria-label="Subtitle ends (ms)" type="number" min={cue.startMs+1} max="600000" step="10" value={cue.endMs} onchange={event => edit({endMs:Math.max(cue!.startMs+1,Math.min(600000,Math.round(Number(event.currentTarget.value)||0)))})} /></label>
    </div>
    <p class="note">Source recording times. Changing Start moves this line while keeping its duration; End adjusts its duration. On the timeline: {(subtitleTimelineTime(cue.startMs,audio,value.offsetMs)/1000).toFixed(2)}–{(subtitleTimelineTime(cue.endMs,audio,value.offsetMs)/1000).toFixed(2)} s.</p>
    {#if overlap}<p class="note overlap">This line overlaps another subtitle. Adjust its start or end to leave room for both.</p>{/if}
    <div class="buttons">
      <Button variant="outline" size="sm" onclick={() => onplay(Math.max(0,subtitleTimelineTime(cue!.startMs,audio,value.offsetMs)-700))}>Play this line</Button>
      <Button variant="outline" size="sm" onclick={() => onseek(Math.max(audio.at,subtitleTimelineTime(cue!.startMs,audio,value.offsetMs)))}>Preview line</Button>
      <Button variant="ghost" size="sm" onclick={() => edit({startMs:Math.min(sourceTime,cue!.endMs-1)})}>Start at playhead</Button>
      <Button variant="ghost" size="sm" onclick={() => edit({endMs:Math.max(sourceTime,cue!.startMs+1)})}>End at playhead</Button>
      <Button variant="ghost" size="sm" onclick={() => update({cues:value.cues.filter(item => item.id!==cue!.id)})}>Remove line</Button>
    </div>
  {/if}
  <Button variant="outline" size="sm" disabled={value.cues.length>=128} onclick={add}>Add subtitle at playhead</Button>
  <p class="note">Save config keeps these lines and their appearance. Music-only sections have no subtitle.</p>
</div>

<style>
  .subtitle-editor { display: grid; gap: 12px; }
  label { display: grid; gap: 6px; font-size: 11px; color: #c3c8c1; }
  .enable { display: flex; justify-content: space-between; align-items: center; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  select,textarea { width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 4px; padding: 7px; color: #d8dddd; background: #111815; font: inherit; }
  textarea { resize: vertical; }
  .buttons { display: flex; flex-wrap: wrap; gap: 4px; }
  .overlap { color: #dfb786; }
  .note { margin: 0; color: #98a49e; font-size: 10px; line-height: 1.5; }
  h3 { margin: 12px 0 0; font-size: 11px; letter-spacing: .06em; }
  h3 small { float: right; color: #98a49e; }
</style>
