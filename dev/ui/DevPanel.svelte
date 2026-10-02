<script lang="ts">
  import { onMount, onDestroy, tick, untrack } from 'svelte';
  import { RotateCcw, Flame, Sparkles, Play, Pause } from '@lucide/svelte';
  import { toast } from '$lib/notifications';
  import { avatarIntros, avatarOutros } from '$lib/avatar/transitions';
  import { avatarDefaults, effectPresets, type AvatarPresentation } from '$lib/avatar/presentation';
  import { expressionNames, type AvatarPlayback, type AvatarRequest, type MockDaddyExpression } from '$lib/avatar/playback';
  import { configSchema, type Config } from '$lib/config';
  import { studioDefaults, type StudioDefaults, type Overrides } from '$lib/tuning';
  import { createAutosave, type AutosaveStatus } from '$lib/ui/autosave';
  import type { AvatarLabOptions } from '../../src/lib/avatar/preview';
  import { gameEventContentSchema, type GameEventContent } from '$lib/game-events/schema';
  import type { GameRuleStatus } from '$lib/game-events/rules';
  import GameEventRules from './GameEventRules.svelte';
  import AdlibControls from './AdlibControls.svelte';
  import GameEventControls from './GameEventControls.svelte';
  import type { GameCue, GameEventsState, TransmissionDismissed } from '$lib/game-events/types';
  import HudControls from '$lib/components/hud/HudControls.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Slider } from '$lib/components/ui/slider';
  import { Switch } from '$lib/components/ui/switch';
  import SettingsLayout from '$lib/components/settings/SettingsLayout.svelte';
  import ConfigFields from '$lib/components/settings/ConfigFields.svelte';
  import WeaponTuning from './WeaponTuning.svelte';
  import DestructionTuning from './DestructionTuning.svelte';
  import WeaponLighting from './WeaponLighting.svelte';
  import type { WeaponLightingSettings } from '$lib/weapons/lighting-config';
  import { studioGroups, tuningPages } from './sections';
  import Modal from '$lib/components/Modal.svelte';
  import SingleSelect from '$lib/components/SingleSelect.svelte';

  let { open, selectionWheel = $bindable(false), transmissionExample = $bindable(false), presentation = $bindable(), options = $bindable(), playback, config, content, ruleStatus, events, dismissed, ongameevent, onclearevents, oncontent, onclose, onrequest, onreset, onpuff, onflash, onpreview }: {
    open: boolean;
    selectionWheel?: boolean;
    transmissionExample?: boolean;
    presentation: AvatarPresentation;
    options: AvatarLabOptions;
    playback?: AvatarPlayback;
    config: Config;
    content: GameEventContent;
    ruleStatus: GameRuleStatus;
    events: GameEventsState;
    dismissed?: TransmissionDismissed;
    ongameevent: (cue: GameCue) => void;
    onclearevents: () => void;
    oncontent: (config: GameEventContent) => void;
    onclose: () => void;
    onrequest: (request: AvatarRequest) => void;
    onreset: () => void;
    onpuff: () => void;
    onflash: () => void;
    onpreview: (config: Config) => void;
  } = $props();

  let tab = $state('avatar-playback');
  const activePage = $derived(tuningPages.find(page => page.id === tab)!);
  let ready = $state(false);
  let draft = $state<Config>(untrack(() => structuredClone($state.snapshot(config))));
  let contentDraft = $state<GameEventContent>(untrack(() => structuredClone($state.snapshot(content))));
  let saveStatus = $state<AutosaveStatus>('idle');
  let saveError = $state<string>();
  const draftValidation = $derived(configSchema.safeParse(draft));
  const contentValidation = $derived(gameEventContentSchema.safeParse(contentDraft));
  const issue = $derived(!draftValidation.success ? draftValidation.error.issues[0] : !contentValidation.success ? contentValidation.error.issues[0] : undefined);
  let baseline = untrack(() => structuredClone($state.snapshot(config)));
  let draftSession = $state(false);
  const editedFields = new Set<string>();
  let previousDraft: string | undefined;
  let savedDefaults = $state<StudioDefaults>(structuredClone(studioDefaults));
  let defaultsPath = $state('config/studio.json');
  const tuningSections = ['hud', 'transmissions', 'display', 'gameplay', 'weapons', 'gloves', 'targets', 'destruction', 'review', 'server'] as const;
  const personalDestructionFields = ['shotsToComplete', 'borderStyle'] as const;
  const words = (value: string) => value.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase());
  function currentDraft(): Config {
    const next = $state.snapshot(draft);
    // A Studio draft can remain open while personal settings are saved.
    next.display.shellTheme = config.display.shellTheme;
    next.display.customColors = config.display.customColors;
    next.display.baseTint = config.display.baseTint;
    next.display.accent = config.display.accent;
    next.display.background = $state.snapshot(config.display.background);
    next.onboarding.colorPickerUnlocked = config.onboarding.colorPickerUnlocked;
    next.dispatch = $state.snapshot(config.dispatch);
    next.crosshair = $state.snapshot(config.crosshair);
    for (const key of personalDestructionFields) Object.assign(next.destruction, { [key]: config.destruction[key] });
    return configSchema.parse(next);
  }
  function artifact(): StudioDefaults {
    const snapshot = currentDraft();
    const changes: Record<string, Record<string, unknown>> = {};
    for (const section of tuningSections) {
      for (const [key, value] of Object.entries(snapshot[section])) {
        if (section === 'display' && ['shellTheme', 'customColors', 'baseTint', 'accent', 'background'].includes(key)) continue;
        if (section === 'destruction' && (personalDestructionFields as readonly string[]).includes(key)) continue;
        const path = `${section}.${key}`;
        if (JSON.stringify(value) !== JSON.stringify((baseline[section] as Record<string, unknown>)[key])) editedFields.add(path);
        // Keep a field after it is first edited, including a change back to its
        // opening value while an earlier save is still in flight.
        if (editedFields.has(path)) (changes[section] ||= {})[key] = value;
      }
    }
    const game = structuredClone($state.snapshot(savedDefaults).game || {});
    // Shell palettes are personal preferences, including older Studio overrides.
    if (game.display) { delete game.display.shellTheme; delete game.display.customColors; delete game.display.baseTint; delete game.display.accent; delete game.display.background; }
    if (game.onboarding) delete game.onboarding.colorPickerUnlocked;
    delete game.dispatch;
    delete game.crosshair;
    if (game.destruction) for (const key of personalDestructionFields) delete game.destruction[key];
    for (const [section, fields] of Object.entries(changes)) {
      const key = section as keyof typeof game;
      // Changed fields already contain the complete draft value. Replace them
      // so removing a custom profile or optional sound isn't merged back in.
      Object.assign(game, { [key]: { ...game[key], ...fields } });
    }
    const { paused, ...playbackDefaults } = $state.snapshot(options);
    return {
      avatar: $state.snapshot(presentation),
      playback: playbackDefaults,
      ...gameEventContentSchema.parse($state.snapshot(contentDraft)),
      game: game as Overrides<Config>
    };
  }

  onMount(() => {
    void fetch('/__dev/defaults').then(response => response.json()).then(result => {
      if (result.defaults) savedDefaults = result.defaults;
      if (result.path) defaultsPath = result.path;
    }).catch(error => toast.error(String(error))).finally(() => ready = true);
  });
  $effect(() => {
    if (open && ready && !draftSession) {
      untrack(() => {
        baseline = structuredClone($state.snapshot(config));
        draft = structuredClone(baseline);
        contentDraft = structuredClone($state.snapshot(content));
        editedFields.clear();
        previousDraft = undefined;
      });
      draftSession = true;
    } else if (!open) draftSession = false;
  });

  const autosave = createAutosave<{ settings: StudioDefaults & { preview: Config } }>(async ({ settings }) => {
    const response = await fetch('/__dev/defaults', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save Studio settings.');
    savedDefaults = result.defaults;
    defaultsPath = result.path;
  }, (status, error) => { saveStatus = status; saveError = error; });

  $effect(() => {
    if (!open || !ready || !draftSession) return;
    const { paused, ...playbackSettings } = $state.snapshot(options);
    const next = JSON.stringify({
      game: $state.snapshot(draft), avatar: $state.snapshot(presentation),
      playback: playbackSettings, content: $state.snapshot(contentDraft)
    });
    untrack(() => {
      const previous = previousDraft;
      previousDraft = next;
      if (previous === undefined || previous === next) return;
      if (issue) { autosave.cancel('settings'); return; }
      onpreview(currentDraft());
      oncontent(gameEventContentSchema.parse($state.snapshot(contentDraft)));
      autosave.update({ settings: { ...artifact(), preview: currentDraft() } });
    });
  });

  async function close() {
    await tick();
    if (!issue && await autosave.flush()) onclose();
  }
  onDestroy(() => { void autosave.flush(); });

  function play(expression: MockDaddyExpression) {
    options.paused = false;
    onrequest({ expression, durationMs: options.durationMs || undefined, policy: options.policy, finishCycle: options.finishCycle, transition: { ...presentation.transitions } });
  }
  function previewHud(hud: Config['hud']) {
    draft.hud = hud;
  }
  function previewWeaponLighting({ lighting, exposure }: WeaponLightingSettings) {
    draft.weapons.lighting = lighting;
    draft.weapons.exposure = exposure;
  }

</script>

{#snippet slider(label: string, value: number, min: number, max: number, step: number, change: (value: number) => void)}
  <div class="my-3 block text-sm [&>div]:flex [&>div]:justify-between [&>div]:gap-2"><div>{label}<span class="text-muted-foreground tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}</span></div><Slider class="mt-1.5 h-5" type="single" thumbLabel={label} {min} {max} {step} {value} onValueChange={change} /></div>
{/snippet}

{#if open && ready}
  <Modal title="Game studio" eyebrow="DEVELOPMENT ONLY" onclose={() => void close()} wide floating fixedHeight layoutKey="game-studio">
    <SettingsLayout groups={studioGroups} bind:value={tab} label="Studio sections">
      {#if tab === 'avatar-playback'}
        <div class="flex flex-wrap items-center gap-2 pb-3.5 text-sm tabular-nums [&>span]:ml-auto [&>span]:text-muted-foreground [&>small]:basis-full [&>small]:text-muted-foreground"><strong>{playback?.expression || 'Loading'}</strong><span>{((playback?.clipTimeMs || 0) / 1000).toFixed(1)}s / {((playback?.clipMs || 0) / 1000).toFixed(1)}s</span><small>{playback?.queue.length ? `Queued: ${playback.queue.join(' → ')}` : 'Queue empty'}</small></div>
        <div class="grid grid-cols-3 gap-1.5">{#each expressionNames as expression}<Button variant="outline" selected={playback?.expression === expression} aria-pressed={playback?.expression === expression} class="px-1 text-xs" onclick={() => play(expression)}>{words(expression)}</Button>{/each}</div>
        <div class="my-3 flex gap-2"><Button variant="outline" class="flex-1" onclick={() => options.paused = !options.paused}>{#if options.paused}<Play size={15} />Resume{:else}<Pause size={15} />Pause{/if}</Button><Button variant="outline" class="flex-1" onclick={onreset}><RotateCcw size={15} />Idle / clear queue</Button></div>
        <div class="my-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          <label class="grid gap-2 text-xs text-muted-foreground">Duration (ms; 0 = one loop)<Input type="number" min="0" step="100" bind:value={options.durationMs} /></label>
          <div class="grid gap-2 text-xs text-muted-foreground"><SingleSelect label="New reaction" value={options.policy} options={[{ value: 'queue', label: 'Queue after current' }, { value: 'interrupt', label: 'Interrupt immediately' }]} onchange={next => options.policy = next as AvatarLabOptions['policy']} /></div>
        </div>
        <div class="flex items-center justify-between gap-2.5 border-b border-border/50 py-2.5 text-sm text-muted-foreground"><Label for="studio-finish-cycle">Finish the last loop</Label><Switch id="studio-finish-cycle" bind:checked={options.finishCycle} /></div>
        <div class="flex items-center justify-between gap-2.5 border-b border-border/50 py-2.5 text-sm text-muted-foreground"><Label for="studio-click-cycle">Click portrait to cycle expressions</Label><Switch id="studio-click-cycle" bind:checked={options.clickCycle} /></div>

      {:else if tab === 'avatar-transitions'}
        <div class="my-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          <div class="grid gap-2 text-xs text-muted-foreground"><SingleSelect label="Entrance" value={presentation.transitions.intro} options={Object.entries(avatarIntros).map(([value, label]) => ({ value, label }))} onchange={next => presentation.transitions.intro = next as typeof presentation.transitions.intro} /></div>
          <div class="grid gap-2 text-xs text-muted-foreground"><SingleSelect label="Exit" value={presentation.transitions.outro} options={Object.entries(avatarOutros).map(([value, label]) => ({ value, label }))} onchange={next => presentation.transitions.outro = next as typeof presentation.transitions.outro} /></div>
        </div>
        {@render slider('Entrance duration (ms)', presentation.transitions.introMs, 120, 1800, 20, value => presentation.transitions.introMs = value)}
        {@render slider('Exit duration (ms)', presentation.transitions.outroMs, 120, 1200, 20, value => presentation.transitions.outroMs = value)}
        <p class="my-3 text-xs leading-relaxed text-muted-foreground">Choose a face under Expressions & playback to queue it with this entrance and exit. Break through splits the shutter apart. Playback time begins after the entrance.</p>
        {#if playback?.phase && playback.phase !== 'steady'}<div class="text-xs font-semibold text-primary">{playback.phase === 'outro' ? 'Exiting' : 'Entering'}{playback.nextExpression ? ' → ' + words(playback.nextExpression) : ''}</div>{/if}

      {:else if tab === 'avatar-framing'}
        <h3 class="mb-3 text-base font-semibold">Image quality</h3>
        <div class="grid gap-2 text-xs text-muted-foreground"><SingleSelect label="Render detail" value={String(presentation.quality.renderScale)} options={[{ value: '1', label: 'Standard · native resolution' }, { value: '2', label: 'High · 2× resolution' }, { value: '3', label: 'Ultra · 3× resolution' }]} onchange={next => presentation.quality.renderScale = Number(next)} /></div>
        <p class="my-3 text-xs leading-relaxed text-muted-foreground">High and Ultra render extra pixels before shrinking to the portrait frame. Higher settings use more GPU; your screen’s native resolution is always preserved.</p>
        {@render slider('Portrait frame rate', presentation.quality.fps, 15, 60, 5, value => presentation.quality.fps = value)}

        <h3 class="mt-6 mb-3 text-base font-semibold">Face framing</h3>
        <p class="my-3 text-xs leading-relaxed text-muted-foreground">Position the face inside its frame. Frame dimensions and placement are under HUD → Layout & proportions and Portrait.</p>
        {@render slider('Face horizontal offset (px)', presentation.framing.offsetXPx, -150, 150, 1, value => presentation.framing.offsetXPx = value)}
        {@render slider('Face vertical offset (px)', presentation.framing.offsetYPx, -150, 150, 1, value => presentation.framing.offsetYPx = value)}
        {@render slider('Face zoom', presentation.framing.zoom, .5, 1.8, .01, value => presentation.framing.zoom = value)}

      {:else if tab === 'avatar-motion'}
        {#each ['pitch', 'yaw', 'roll'] as axis}
          {@render slider(words(axis) + ' (degrees)', presentation.tilt[axis as keyof typeof presentation.tilt], -8, 8, .1, value => presentation.tilt[axis as keyof typeof presentation.tilt] = value)}
        {/each}
        {@render slider('Movement', presentation.motion.amount, 0, 1, .01, value => presentation.motion.amount = value)}
        {@render slider('Movement speed', presentation.motion.speed, 0, 4, .05, value => presentation.motion.speed = value)}
        {@render slider('Response (ms)', presentation.motion.responseMs, 0, 1000, 10, value => presentation.motion.responseMs = value)}

      {:else if tab === 'avatar-effects'}
        <div class="grid gap-2 text-xs text-muted-foreground"><SingleSelect label="Preset" value={presentation.effects} options={Object.keys(effectPresets).map(value => ({ value, label: words(value) }))} onchange={next => { presentation.effects = next as AvatarPresentation['effects']; presentation.effectOverrides = {}; }} /></div>
        <div class="flex items-center justify-between gap-2.5 border-b border-border/50 py-2.5 text-sm text-muted-foreground"><Label for="studio-effects-enabled">Enable effects</Label><Switch id="studio-effects-enabled" bind:checked={presentation.effectsEnabled} /></div>
        {#each ['smoke', 'fire', 'embers', 'reflections', 'glare', 'sparkle'] as effect}
          {@const key = effect as 'smoke' | 'fire' | 'embers' | 'reflections' | 'glare' | 'sparkle'}
          {@render slider(words(effect), presentation.effectOverrides[key] ?? effectPresets[presentation.effects][key], 0, 1, .01, value => presentation.effectOverrides = { ...presentation.effectOverrides, [key]: value })}
        {/each}
        {@render slider('Glow brightness', presentation.effectOverrides.glowIntensity ?? effectPresets[presentation.effects].glowIntensity, 0, 20, .1, value => presentation.effectOverrides = { ...presentation.effectOverrides, glowIntensity: value })}
        {@render slider('Glow size', presentation.effectOverrides.glowSize ?? effectPresets[presentation.effects].glowSize, .5, 4, .1, value => presentation.effectOverrides = { ...presentation.effectOverrides, glowSize: value })}
        {@render slider('Glare speed', presentation.effectOverrides.glareSpeed ?? effectPresets[presentation.effects].glareSpeed, 0, 2, .01, value => presentation.effectOverrides = { ...presentation.effectOverrides, glareSpeed: value })}
        {#each ['x', 'y', 'z'] as axis}
          {@const key = axis as 'x' | 'y' | 'z'}
          {@render slider('Wind ' + axis.toUpperCase(), (presentation.effectOverrides.wind ?? effectPresets[presentation.effects].wind)[key], -1, 1, .01, value => presentation.effectOverrides = { ...presentation.effectOverrides, wind: { ...(presentation.effectOverrides.wind ?? effectPresets[presentation.effects].wind), [key]: value } })}
        {/each}
        <div class="my-3 flex gap-2"><Button variant="outline" class="flex-1" onclick={onpuff}><Flame size={15} />Puff</Button><Button variant="outline" class="flex-1" onclick={onflash}><Sparkles size={15} />Flash glasses</Button><Button variant="outline" class="flex-1" onclick={() => presentation = structuredClone(avatarDefaults)}>Reset appearance</Button></div>
      {:else if tab === 'game-selection'}
        <div class="flex items-center justify-between gap-4 border-b border-border/50 py-3">
          <Label for="studio-selection-wheel">Select with violation wheel</Label>
          <Switch id="studio-selection-wheel" bind:checked={selectionWheel} />
        </div>
        <p class="my-3 text-sm leading-relaxed text-muted-foreground">Drag across code rows, then release to open the wheel. Hover a group and click a violation to mark the selected lines. Shift-click to add more codes. Hover the center to hide the codes; click it, move outside, or press Escape to close.</p>
        <p class="text-xs leading-relaxed text-muted-foreground">Prototype · Weapons are holstered while enabled. Turn this off to resume shooting. This toggle lasts until the page is reloaded.</p>
      {:else if tab === 'events-preview'}
        <GameEventControls clips={contentDraft.adlibs.clips} {config} playback={events} {dismissed} onplay={ongameevent} onclear={onclearevents} />
      {:else if tab === 'events-rules' || tab === 'events-bench'}
        <GameEventRules bind:value={contentDraft.events} library={contentDraft.adlibs} live={ruleStatus} section={tab.slice(7)} onplay={ongameevent} />
      {:else if tab.startsWith('hud-')}
        <HudControls value={draft.hud} onchange={previewHud} section={tab.slice(4)} />
      {:else if tab.startsWith('adlibs-')}
        <AdlibControls bind:value={contentDraft.adlibs} volume={config.gameplay.sound && config.gameplay.adlibs ? config.gameplay.volume : 0} section={tab.slice(7)} usedCategories={contentDraft.events.rules.flatMap(rule => rule.voice && 'category' in rule.voice ? [rule.voice.category] : [])} usedClips={contentDraft.events.rules.flatMap(rule => rule.voice && 'clip' in rule.voice ? [rule.voice.clip] : [])} onvoice={clip => ongameevent({ voice: $state.snapshot(clip), mode: 'immediate', priority: 10, expiresMs: 1200 })} />
      {:else if tab === 'weapon-lighting'}
        <WeaponLighting weapons={draft.weapons} onchange={previewWeaponLighting} />
      {:else if activePage.section && activePage.fields}
        {#if tab === 'display-motion'}
          <div class="mb-4 flex items-center justify-between gap-4 border-b border-border/50 pb-4">
            <div class="grid gap-1.5">
              <Label for="studio-transmission-example">Always show example transmission box</Label>
              <p id="studio-transmission-example-description" class="text-xs leading-relaxed text-muted-foreground">Keep a silent example visible between live transmissions. Saved only in this browser.</p>
            </div>
            <Switch id="studio-transmission-example" bind:checked={transmissionExample} aria-describedby="studio-transmission-example-description" />
          </div>
        {/if}
        <ConfigFields value={draft[activePage.section]} schemas={configSchema.shape[activePage.section].unwrap().shape} fields={activePage.fields}
          onchange={(key, value) => (draft[activePage.section!] as Record<string, unknown>)[key] = value} />
      {:else if tab === 'destruction-effects'}
        <DestructionTuning bind:value={draft.destruction} />
      {:else if tab.startsWith('weapon-')}
        <WeaponTuning bind:config={draft} page={tab} />
      {/if}
    </SettingsLayout>
    <footer class="shrink-0 border-t border-border px-4 py-3.5" data-autosave-status={saveStatus}>
      {#if issue}<p class="mb-3 text-sm text-destructive" role="alert">{issue.path.map(part => words(String(part))).join(' → ')}: {issue.message}</p>{/if}
      {#if saveError}
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm text-destructive" role="alert">Could not save Studio settings: {saveError}</p>
          <Button variant="outline" size="sm" onclick={() => void autosave.flush()}>Retry</Button>
        </div>
      {:else if tab === 'game-selection'}
        <p class="text-xs text-muted-foreground" role="status">Temporary setting · resets when you reload the page</p>
      {:else}
        <p class="text-xs text-muted-foreground" role="status" title={defaultsPath}>{saveStatus === 'saving' ? 'Saving…' : 'Changes save automatically to config/studio.json'}</p>
      {/if}
      <div class="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground"><a href="/__dev/landscape" target="_blank" rel="noopener" class="hover:text-foreground">Landscape workshop ↗</a><a href="/__dev/splash" target="_blank" rel="noopener" class="hover:text-foreground">Splash workbench ↗</a></div>
    </footer>
  </Modal>
{/if}
