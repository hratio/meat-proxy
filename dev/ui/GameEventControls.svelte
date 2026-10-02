<script lang="ts">
  import { untrack } from 'svelte';
  import type { AdlibConfig } from '$lib/adlibs/schema';
  import type { Config } from '$lib/config';
  import { expressionNames, type MockDaddyExpression } from '$lib/avatar/playback';
  import { effectPresets, type AvatarEffectsPreset } from '$lib/avatar/presentation';
  import type { GameCue, GameEventsState, TransmissionDismissed } from '$lib/game-events/types';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import SingleSelect from '$lib/components/SingleSelect.svelte';

  let { clips, config, playback, dismissed, onplay, onclear }: {
    clips: AdlibConfig['clips']; config: Config; playback: GameEventsState; dismissed?: TransmissionDismissed;
    onplay: (cue: GameCue) => void; onclear: () => void;
  } = $props();
  let clipId = $state('mockdaddy-one-character-bug');
  let expression = $state<MockDaddyExpression>('ShadesPeek'), hud = $state<MockDaddyExpression>('Grin');
  let effects = $state<AvatarEffectsPreset>('normal');
  let includeHud = $state(true), movement = $state(true);
  let title = $state('INCOMING TRANSMISSION');
  let silentText = $state('Looks clean from here. Keep your eyes on the diff.');
  let intro = $state(untrack(() => config.transmissions.introSeconds)), outro = $state(untrack(() => config.transmissions.outroSeconds));
  let splash = $state<'signal' | 'impact'>('signal');
  const clip = $derived(clips.find(c => c.id === clipId));
  const expressions = expressionNames.map(value => ({ value, label: value }));
  function play(mode: 'queue' | 'immediate') {
    onplay({ priority: 100, mode, voice: clip ? $state.snapshot(clip) : undefined,
      hud: includeHud ? { request: { expression: hud, finishCycle: true } } : undefined,
      transmission: { title, text: clip?.text || clip?.name || silentText, splash, movement, introSeconds: intro, outroSeconds: outro,
        portrait: { request: { expression }, presentation: { effects } } } });
  }
</script>

<div class="grid gap-4" aria-label="Game event preview">
  <p class="text-sm text-muted-foreground">Preview runs in the arena. Aim and fire at the message to shatter it. Your transmission, audio and reduced-motion preferences still apply.</p>
  <SingleSelect label="Voice line" value={clipId} onchange={value => clipId = value} options={[{ value: '', label: 'Silent message' }, ...clips.filter(c => c.enabled).map(c => ({ value: c.id, label: c.name }))]} />
  <label class="grid gap-2 text-sm">Transmission title<Input bind:value={title} maxlength={80} /></label>
  {#if clip}<p class="rounded-md border border-border p-3 text-sm">{clip.text || clip.name}<span class="mt-2 block text-xs text-muted-foreground">{clip.durationSec?.toFixed(2) || 'Decoded'} seconds of speech</span></p>
  {:else}<label class="grid gap-2 text-sm">Message<Input bind:value={silentText} maxlength={1200} /></label>{/if}
  <div class="grid grid-cols-2 gap-3">
    <SingleSelect label="Transmission expression" value={expression} onchange={value => expression = value as MockDaddyExpression} options={expressions} />
    <SingleSelect label="Portrait effects" value={effects} onchange={value => effects = value as AvatarEffectsPreset} options={Object.keys(effectPresets).map(value => ({ value, label: value }))} />
    <label class="grid gap-2 text-sm">Intro (seconds)<Input type="number" min="0" max="5" step=".05" bind:value={intro} /></label>
    <label class="grid gap-2 text-sm">Outro (seconds)<Input type="number" min="0" max="5" step=".05" bind:value={outro} /></label>
  </div>
  <SingleSelect label="Splash" value={splash} onchange={value => splash = value as typeof splash} options={[{ value: 'signal', label: 'Signal sweep' }, { value: 'impact', label: 'Impact burst' }]} />
  <div class="flex items-center justify-between"><Label for="event-movement">Floating movement</Label><Switch id="event-movement" bind:checked={movement} /></div>
  <div class="flex items-center justify-between"><Label for="event-hud">Include a HUD reaction</Label><Switch id="event-hud" bind:checked={includeHud} /></div>
  {#if includeHud}<SingleSelect label="HUD expression" value={hud} onchange={value => hud = value as MockDaddyExpression} options={expressions} />{/if}
  <div class="flex flex-wrap gap-2">
    <Button onclick={() => play('immediate')}>Play transmission</Button>
    <Button variant="outline" onclick={() => play('queue')}>Queue transmission</Button>
    <Button variant="outline" onclick={() => onplay({ hud: { request: { expression: hud } } })}>HUD only</Button>
    <Button variant="outline" disabled={!clip} onclick={() => clip && onplay({ voice: $state.snapshot(clip), mode: 'immediate', priority: 10, expiresMs: 1200 })}>Voice only</Button>
    <Button variant="outline" onclick={onclear}>Clear events</Button>
  </div>
  <div class="rounded-md border border-border p-3 text-xs text-muted-foreground" aria-live="polite">
    <p data-event-status>Transmission: {playback.transmission?.phase || 'idle'} · Voice: {playback.voice || 'idle'} · HUD: {playback.hud?.cue.request.expression || 'idle'}</p>
    <p>Queued: {playback.queued.length}{playback.queued.length ? ` · ${playback.queued.map(c => c.key).join(' → ')}` : ''}</p>
    {#if !config.transmissions.enabled}<p>Transmissions are disabled in Settings.</p>{/if}
    {#if !config.gameplay.sound || !config.gameplay.adlibs || !config.gameplay.volume}<p>Speech is muted. Messages use the clip’s recorded duration.</p>{/if}
    {#if dismissed}<p data-transmission-dismissed={dismissed.id}>Dismissal event #{dismissed.id}: {dismissed.reason}</p>{/if}
  </div>
</div>
