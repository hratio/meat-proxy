<script lang="ts">
  import { untrack } from 'svelte';
  import type { AdlibConfig } from '$lib/adlibs/schema';
  import { gameEventContentSchema, gameEventRuleSchema, gameEventSources, type GameEventConfig, type GameEventSource, type GameEventRule } from '$lib/game-events/schema';
  import { createGameEventRules, type GameRuleStatus, type GameEventCounter } from '$lib/game-events/rules';
  import type { GameCue } from '$lib/game-events/types';
  import { expressionNames, type MockDaddyExpression } from '$lib/avatar/playback';
  import { weaponCatalog } from '$lib/weapons/catalog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import SingleSelect from '$lib/components/SingleSelect.svelte';

  let { value = $bindable(), library, live, onplay, section = 'rules' }: {
    value: GameEventConfig; library: AdlibConfig; live: GameRuleStatus; onplay: (cue: GameCue) => void; section?: string;
  } = $props();
  const valid = $derived(gameEventContentSchema.safeParse({ adlibs: library, events: value }));
  const voices = $derived([
    { value: '', label: 'None' },
    ...library.categories.map(category => ({ value: `category:${category.id}`, label: `Category: ${category.name}` })),
    ...library.clips.filter(clip => clip.enabled).map(clip => ({ value: `clip:${clip.id}`, label: `Clip: ${clip.name}` }))
  ]);
  const expressions = expressionNames.map(value => ({ value, label: value }));
  let ruleId = $state(''), testWeapon = $state('rhein-9');
  const selectedIndex = $derived(Math.max(0, value.rules.findIndex(rule => rule.id === ruleId)));
  let counters = $state<GameEventCounter[]>([]), lastRule = $state<string>();
  let bench = untrack(() => createGameEventRules(gameEventContentSchema.parse({})));
  $effect(() => {
    const parsed = gameEventContentSchema.safeParse($state.snapshot({ adlibs: library, events: value }));
    if (parsed.success) bench = createGameEventRules(parsed.data);
    counters = parsed.success ? bench.counters() : []; lastRule = undefined;
  });
  const voiceValue = (rule: GameEventRule) => !rule.voice ? '' : 'category' in rule.voice ? `category:${rule.voice.category}` : `clip:${rule.voice.clip}`;
  function setVoice(rule: GameEventRule, selection: string) {
    rule.voice = !selection ? undefined : selection.startsWith('category:') ? { category: selection.slice(9) } : { clip: selection.slice(5) };
  }
  function addRule() {
    let n = 1;
    while (value.rules.some(rule => rule.id === `event-${n}`)) n++;
    const rule = gameEventRuleSchema.parse({ id: `event-${n}`, name: 'New game event', enabled: false, events: ['file-complete'] });
    value.rules.push(rule); ruleId = rule.id;
  }
  function simulate(source: GameEventSource) {
    if (!valid.success) return;
    const selected = bench.emit([source === 'background-shot' || source === 'weapon-shot'
      ? { type: 'shot', weapon: testWeapon, background: source === 'background-shot' }
      : { type: source }], performance.now());
    counters = bench.counters();
    if (selected) { lastRule = selected.rule; onplay(selected.cue); }
  }
</script>

<div class="grid gap-4">
  <p class="text-sm text-muted-foreground">Each rule can play a voice, change the HUD expression, show a transmission, or combine them. Valid changes apply and save automatically.</p>
  {#if !valid.success}<p class="text-sm text-destructive" role="alert">{valid.error.issues[0].path.join('.')}: {valid.error.issues[0].message}</p>{/if}
  {#if section === 'bench'}
    <p class="text-sm text-muted-foreground">These counters are separate from the arena. Triggered reactions use the arena queue and your current sound preferences. Draft edits reset the counters.</p>
    <SingleSelect label="Test weapon" bind:value={testWeapon} options={weaponCatalog.map(weapon => ({ value: weapon.id, label: weapon.name }))} />
    <div class="flex flex-wrap gap-2">
      {#each Object.entries(gameEventSources) as [source, label]}
        <Button variant="outline" disabled={!valid.success} onclick={() => simulate(source as GameEventSource)}>{label}</Button>
      {/each}
      <Button variant="outline" onclick={() => { bench.reset(); counters = bench.counters(); lastRule = undefined; }}>Reset counters</Button>
    </div>
    <p class="text-xs text-primary" aria-live="polite">{lastRule ? `Last rule: ${lastRule}` : 'No rule triggered yet'}</p>
    {#each counters as counter}<p class="text-xs tabular-nums" data-event-counter={counter.id}>{counter.id}: <strong>{counter.count} / {counter.threshold}</strong> · triggered {counter.played}</p>{/each}
    {#if live.counters.length}<details class="text-xs"><summary class="cursor-pointer">Arena counters</summary>{#each live.counters as counter}<p class="tabular-nums">{counter.id}: {counter.count} / {counter.threshold} · triggered {counter.played}</p>{/each}</details>{/if}
  {:else}
    <SingleSelect label="Trigger rule" value={value.rules[selectedIndex]?.id || ''} options={value.rules.map(rule => ({ value: rule.id, label: rule.name }))} onchange={value => ruleId = value} />
    {#each value.rules as rule, index}
      {#if index === selectedIndex}
        <fieldset class="grid min-w-0 gap-4 rounded-md border border-border p-3" data-event-rule={rule.id}>
          <legend class="px-1 text-sm">{rule.name}</legend>
          <div class="grid grid-cols-2 gap-3">
            <label class="grid gap-2 text-xs text-muted-foreground">Rule ID<Input value={rule.id} oninput={event => { rule.id = event.currentTarget.value; ruleId = rule.id; }} /></label>
            <label class="grid gap-2 text-xs text-muted-foreground">Rule name<Input bind:value={rule.name} /></label>
          </div>
          <div class="flex items-center justify-between gap-3"><Label for={`event-enabled-${index}`}>Enabled</Label><Switch id={`event-enabled-${index}`} bind:checked={rule.enabled} /></div>
          <SingleSelect label="Voice" value={voiceValue(rule)} options={voices} onchange={value => setVoice(rule, value)} />
          <SingleSelect label="HUD expression" value={rule.hud?.expression || ''} options={[{ value: '', label: 'None' }, ...expressions]} onchange={value => rule.hud = value ? { finishCycle: true, ...rule.hud, expression: value as MockDaddyExpression } : undefined} />
          {#if rule.hud}
            <label class="grid gap-2 text-xs text-muted-foreground">HUD duration (ms; blank = one animation)<Input type="number" min="0" max="600000" bind:value={rule.hud.durationMs} /></label>
            <div class="flex items-center justify-between gap-3"><Label for={`event-cycle-${index}`}>Finish the animation cycle</Label><Switch id={`event-cycle-${index}`} bind:checked={rule.hud.finishCycle} /></div>
          {/if}
          <div class="flex items-center justify-between gap-3"><Label for={`event-transmission-${index}`}>Show a transmission</Label><Switch id={`event-transmission-${index}`} checked={!!rule.transmission} onCheckedChange={checked => rule.transmission = checked ? { title: 'INCOMING TRANSMISSION', text: '', expression: 'ShadesPeek', splash: 'signal' } : undefined} /></div>
          {#if rule.transmission}
            <label class="grid gap-2 text-xs text-muted-foreground">Message title<Input bind:value={rule.transmission.title} maxlength={80} /></label>
            <label class="grid gap-2 text-xs text-muted-foreground">Message text<Textarea bind:value={rule.transmission.text} maxlength={1200} placeholder={rule.voice ? 'Leave blank to use the voice transcript' : 'Enter the silent message'} /></label>
            <div class="grid grid-cols-2 gap-3">
              <SingleSelect label="Message expression" value={rule.transmission.expression} options={expressions} onchange={value => { if (rule.transmission) rule.transmission.expression = value as MockDaddyExpression; }} />
              <SingleSelect label="Message splash" bind:value={rule.transmission.splash} options={[{ value: 'signal', label: 'Signal' }, { value: 'impact', label: 'Impact' }]} />
              <SingleSelect label="Message movement" value={rule.transmission.movement === undefined ? 'default' : String(rule.transmission.movement)} options={[{ value: 'default', label: 'Use default' }, { value: 'true', label: 'On' }, { value: 'false', label: 'Off' }]} onchange={value => { if (rule.transmission) rule.transmission.movement = value === 'default' ? undefined : value === 'true'; }} />
              <label class="grid gap-2 text-xs text-muted-foreground">Silent duration (seconds; blank = automatic)<Input type="number" min="0.001" max="600" step=".1" bind:value={rule.transmission.durationSec} /></label>
              <label class="grid gap-2 text-xs text-muted-foreground">Intro (seconds; blank = default)<Input type="number" min="0" max="5" step=".05" bind:value={rule.transmission.introSeconds} /></label>
              <label class="grid gap-2 text-xs text-muted-foreground">Outro (seconds; blank = default)<Input type="number" min="0" max="5" step=".05" bind:value={rule.transmission.outroSeconds} /></label>
            </div>
          {/if}
          <div class="flex items-center justify-between gap-3"><Label for={`event-interrupt-${index}`}>Interrupt ordinary speech</Label><Switch id={`event-interrupt-${index}`} bind:checked={rule.interrupt} /></div>
          <div class="grid gap-3 border-t border-border pt-3">
            <p class="text-sm">Trigger when</p>
            {#each Object.entries(gameEventSources) as [source, label]}
              <div class="flex items-center justify-between gap-3"><Label for={`event-source-${index}-${source}`}>{label}</Label><Switch id={`event-source-${index}-${source}`} checked={rule.events.includes(source as GameEventSource)} onCheckedChange={checked => rule.events = checked ? [...rule.events, source as GameEventSource] : rule.events.filter(event => event !== source)} /></div>
            {/each}
          </div>
          <label class="grid gap-2 text-xs text-muted-foreground">Weapon IDs or model URLs (comma separated; blank = all)<Input value={rule.weapons.join(', ')} oninput={event => rule.weapons = event.currentTarget.value.split(',').map(item => item.trim()).filter(Boolean)} /></label>
          <div class="grid grid-cols-2 gap-3">
            <label class="grid gap-2 text-xs text-muted-foreground">Chance to count (%)<Input type="number" min="0" max="100" value={rule.incrementChance * 100} oninput={event => rule.incrementChance = Number(event.currentTarget.value) / 100} /></label>
            <label class="grid gap-2 text-xs text-muted-foreground">Cooldown (ms)<Input type="number" min="0" max="600000" bind:value={rule.cooldownMs} /></label>
            <label class="grid gap-2 text-xs text-muted-foreground">Minimum count<Input type="number" min="1" max="10000" bind:value={rule.minCount} /></label>
            <label class="grid gap-2 text-xs text-muted-foreground">Maximum count<Input type="number" min="1" max="10000" bind:value={rule.maxCount} /></label>
          </div>
          <p class="text-xs text-muted-foreground">Selected triggers share this counter. Rules higher in the list win ties.</p>
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" disabled={index === 0} onclick={() => { ruleId = rule.id; [value.rules[index - 1], value.rules[index]] = [rule, value.rules[index - 1]]; }}>Move up</Button>
            <Button variant="outline" onclick={() => value.rules.splice(index, 1)}>Remove rule</Button>
          </div>
        </fieldset>
      {/if}
    {/each}
    <Button variant="outline" onclick={addRule}>Add rule</Button>
  {/if}
</div>
