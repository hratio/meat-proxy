<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { lightningCueSchema, maxLightningCues, type LightningCue } from '$lib/components/splash/landscape-config';

  let { cues, timeMs, duration, onchange, onseek, onplace }: {
    cues: LightningCue[]; timeMs: number; duration: number;
    onchange: (cues: LightningCue[]) => void;
    onseek: (timeMs: number) => void;
    onplace: (cue: LightningCue) => void;
  } = $props();
  let draft = $state('1500'), message = $state('');
  let expanded = $state<Record<number, boolean>>({});
  let valid = $derived(draft.trim() !== '' && Number.isSafeInteger(Number(draft)) && Number(draft) >= 0);
  const numbers = [
    { key: 'x', label: 'Across camera', unit: 'm', min: -2400, step: 1 },
    { key: 'distance', label: 'Distance ahead', unit: 'm', min: 2, step: 1 },
    { key: 'height', label: 'Bolt height', unit: 'm', min: 20, step: 1 },
    { key: 'branches', label: 'Branching', unit: '', min: 0, step: .05 },
    { key: 'intensity', label: 'Brightness multiplier', unit: '×', min: 0, step: .1 }
  ] as const;

  function commit(next: LightningCue[]) {
    message = ''; onchange(next.toSorted((a, b) => a.timeMs - b.timeMs));
  }
  function add(at: number) {
    if (cues.some(cue => cue.timeMs === at)) { message = 'There is already a strike at this time.'; return; }
    if (cues.length >= maxLightningCues) return;
    commit([...cues, lightningCueSchema.parse({ timeMs: at })]);
  }
  function edit(cue: LightningCue, key: keyof LightningCue, value: number | string) {
    const next = lightningCueSchema.safeParse({ ...cue, [key]: value });
    if (!next.success) { message = next.error.issues[0].message; return false; }
    if (key === 'timeMs' && cues.some(other => other !== cue && other.timeMs === value)) { message = 'Each strike needs its own start time.'; return false; }
    if (key === 'timeMs') expanded[next.data.timeMs] = expanded[cue.timeMs] ?? cues.indexOf(cue) === 0;
    commit(cues.map(other => other === cue ? next.data : other));
    return true;
  }
</script>

<div class="grid gap-3" aria-label="Lightning cue editor">
  <p class="text-[11px] leading-relaxed text-muted-foreground">Times are milliseconds from landscape playback start. Each cue starts a leader, followed by the bright stroke. Position is relative to the camera at that cue; forked strikes end at the water level.</p>
  <div class="flex flex-wrap items-end gap-2">
    <label class="grid flex-1 gap-1 text-xs" for="new-lightning-cue">New strike (ms)
      <Input id="new-lightning-cue" aria-label="New lightning cue (ms)" class="h-8 font-mono text-xs" type="number" min="0" step="1" value={draft} oninput={event => draft = event.currentTarget.value} />
    </label>
    <Button variant="outline" class="h-8 px-2 text-xs" disabled={!valid || cues.length >= maxLightningCues} onclick={() => add(Number(draft))}>Add strike</Button>
  </div>
  <Button variant="ghost" class="h-8 justify-start px-2 text-xs" disabled={cues.length >= maxLightningCues} onclick={() => add(Math.round(timeMs))}>Add at playhead · {Math.round(timeMs)} ms</Button>
  {#if !cues.length}<p class="text-xs text-muted-foreground">No scheduled strikes. Adding one selects scheduled timing.</p>{/if}
  {#each cues as cue, index (cue.timeMs)}
    <details open={expanded[cue.timeMs] ?? index === 0} class="rounded-md border border-border bg-background/30 p-3" data-lightning-cue={cue.timeMs}>
      <summary class="cursor-pointer text-xs font-medium" onclick={event => { event.preventDefault(); expanded[cue.timeMs] = !(expanded[cue.timeMs] ?? index === 0); }}>{cue.timeMs} ms · {cue.style}</summary>
      <div class="mt-3 grid grid-cols-2 gap-3">
        <label class="grid gap-1 text-[11px]" for={`cue-${cue.timeMs}-time`}>Start (ms)
          <Input id={`cue-${cue.timeMs}-time`} aria-label={`Lightning cue ${index + 1} start (ms)`} class="h-8 font-mono text-xs" type="number" min="0" step="1" value={cue.timeMs}
            onchange={event => { if (!edit(cue, 'timeMs', event.currentTarget.valueAsNumber)) event.currentTarget.value = String(cue.timeMs); }} />
        </label>
        <label class="grid gap-1 text-[11px]" for={`cue-${cue.timeMs}-style`}>Strike type
          <select id={`cue-${cue.timeMs}-style`} aria-label={`Lightning cue ${index + 1} style`} class="h-8 rounded-md border border-input bg-background px-2 capitalize" value={cue.style} onchange={event => edit(cue, 'style', event.currentTarget.value)}>
            {#each ['forked', 'crawler', 'sheet', 'mixed'] as style}<option value={style}>{style}</option>{/each}
          </select>
        </label>
        {#each numbers as field}
          <label class="grid gap-1 text-[11px]" for={`cue-${cue.timeMs}-${field.key}`}>{field.label}{field.unit ? ` (${field.unit})` : ''}
            <Input id={`cue-${cue.timeMs}-${field.key}`} aria-label={`Lightning cue ${index + 1} ${field.label.toLowerCase()}`} class="h-8 font-mono text-xs" type="number" min={field.min} step={field.step} value={cue[field.key]}
              onchange={event => { if (!edit(cue, field.key, event.currentTarget.valueAsNumber)) event.currentTarget.value = String(cue[field.key]); }} />
          </label>
        {/each}
      </div>
      <div class="mt-3 flex flex-wrap gap-1">
        <Button variant="outline" class="h-7 px-2 text-[11px]" aria-label={`Preview lightning cue ${index + 1}`} onclick={() => onseek(cue.timeMs + duration * 112)}>Preview strike</Button>
        <Button variant="outline" class="h-7 px-2 text-[11px]" aria-label={`Place lightning cue ${index + 1} on water`} onclick={() => onplace(cue)}>Place on water</Button>
        <Button variant="ghost" class="h-7 px-2 text-[11px]" aria-label={`Remove lightning cue ${index + 1}`} onclick={() => commit(cues.filter(other => other !== cue))}>Remove</Button>
      </div>
      <p class="mt-2 text-[10px] text-muted-foreground">Bright stroke starts at {Math.round(cue.timeMs + duration * 100)} ms.</p>
    </details>
  {/each}
  {#if message}<p role="status" class="text-xs text-red-400">{message}</p>{/if}
</div>
