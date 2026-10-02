<script lang="ts">
  import { assetUrl } from '$lib/asset-url';
  import { onDestroy, tick, untrack } from 'svelte';
  import { z } from 'zod';
  import { isDemo } from '$review-client';
  import { useUi } from '$lib/ui/context.svelte';
  import ShellThemePicker from './settings/ShellThemePicker.svelte';
  import ColorUnlock from './settings/ColorUnlock.svelte';
  import CustomShellColors from './settings/CustomShellColors.svelte';
  import KeyBindingSettings from './settings/KeyBindingSettings.svelte';
  import CrosshairPicker from './settings/CrosshairPicker.svelte';
  import TargetPicker from './settings/TargetPicker.svelte';
  import HudTintControl from './hud/HudTintControl.svelte';
  import BackgroundSettings from './settings/BackgroundSettings.svelte';
  import TutorialSettings from './settings/TutorialSettings.svelte';
  import type { ColorUnlockEvent } from '$lib/game-events/schema';
  import { toast } from '$lib/notifications';
  import { Upload, FileCode, Save, Crosshair, ArrowUpRight } from '@lucide/svelte';
  import { configSchema, type Config } from '$lib/config';
  import { modelOptions } from '$lib/weapons/catalog';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import * as InputGroup from '$lib/components/ui/input-group';
  import { createAutosave, type AutosaveStatus } from '$lib/ui/autosave';
  import { Switch } from '$lib/components/ui/switch';
  import SettingsLayout from './settings/SettingsLayout.svelte';
  import ConfigFields from './settings/ConfigFields.svelte';
  import { settingsForMode } from './settings/sections';
  import Modal from './Modal.svelte';
  import PanelFooter from './PanelFooter.svelte';
  import FileListSettings from './FileListSettings.svelte';
  import WeaponPicker from './armory/WeaponPicker.svelte';
  import WeaponArmory from './armory/WeaponArmory.svelte';
  import SingleSelect from './SingleSelect.svelte';

  let { config, onsave, onimport, onclose, oncolorevent, oncinematic }: { config: Config; onsave: (config: Config) => Promise<void>; onimport: (value: unknown) => Promise<void>; onclose: () => void; oncolorevent: (event: ColorUnlockEvent) => void; oncinematic: (active: boolean) => void } = $props();
  let draft = $state<Config>(untrack(() => structuredClone($state.snapshot(config))));
  const gameEnabled = $derived(draft.experience.mode === 'game');
  const visibleGroups = $derived(settingsForMode(draft.experience.mode));
  let tab = $state('colors');
  let saveStatus = $state<AutosaveStatus>('idle');
  let saveError = $state<string>();
  const validation = $derived(configSchema.safeParse(draft));
  let editorExecutable = $state(untrack(() => config.editor.executable));
  const editorValidation = $derived(configSchema.shape.editor.unwrap().shape.executable.safeParse(editorExecutable));
  let importing = $state(false);
  let browsingArmory = $state(false);
  let cinematic = $state(false);
  let colorUnlock = $state<ColorUnlock>();
  $effect(() => { if (!gameEnabled) { browsingArmory = false; cinematic = false; } });
  $effect(() => { oncinematic(cinematic); return () => oncinematic(false); });
  let bindingSettings = $state<KeyBindingSettings>();
  let fileInput = $state<HTMLInputElement | null>(null);
  const words = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

  const ui = useUi();
  $effect(() => {
    ui.previewHudTint = draft.hud.tintStrength;
    return () => { ui.previewHudTint = undefined; };
  });
  $effect(() => {
    ui.previewBackground = { ...draft.display.background };
    return () => { ui.previewBackground = undefined; };
  });
  $effect(() => {
    ui.previewCrosshair = { ...draft.crosshair };
    return () => { ui.previewCrosshair = undefined; };
  });
  $effect(() => {
    ui.previewTheme = draft.display.shellTheme;
    ui.previewColors = { customColors: draft.display.customColors, baseTint: draft.display.baseTint, accent: draft.display.accent };
    return () => { ui.previewTheme = undefined; ui.previewColors = undefined; };
  });

  const autosave = createAutosave<Record<string, unknown>>(async changes => {
    // Merge only edited fields into the latest config, including changes made
    // elsewhere while this floating panel is open.
    const next = structuredClone($state.snapshot(config));
    for (const [path, value] of Object.entries(changes)) {
      const [section, key] = path.split('.');
      (next[section as keyof Config] as Record<string, unknown>)[key] = value;
    }
    await onsave(configSchema.parse(next));
  }, (status, error) => { saveStatus = status; saveError = error; });
  let previous = untrack(() => $state.snapshot(draft));
  $effect(() => {
    const next = $state.snapshot(draft);
    untrack(() => {
      const immediate: Record<string, unknown> = {}, delayed: Record<string, unknown> = {};
      for (const section of Object.keys(next) as (keyof Config)[]) {
        const schemas = configSchema.shape[section].unwrap().shape as Record<string, z.ZodType>;
        for (const [key, value] of Object.entries(next[section])) {
          if (JSON.stringify(value) === JSON.stringify((previous[section] as Record<string, unknown>)[key])) continue;
          const path = `${section}.${key}`, schema = schemas[key];
          let field = schema;
          while (field instanceof z.ZodDefault || field instanceof z.ZodPrefault || field instanceof z.ZodOptional) field = field.unwrap() as z.ZodType;
          const parsed = schema.safeParse(value);
          // An empty number is an unfinished edit, not a request to reset it.
          if (!parsed.success || value === undefined && field instanceof z.ZodNumber && !(schema instanceof z.ZodOptional)) { autosave.cancel(path); continue; }
          const debounce = path === 'display.background' || field instanceof z.ZodNumber || field instanceof z.ZodString && !['bindings', 'reviewBindings', 'weapons', 'editor'].includes(section);
          (debounce ? delayed : immediate)[path] = parsed.data;
        }
      }
      previous = next;
      // Clearing overrides with a preset must also cancel pending color edits.
      if (immediate['display.customColors'] === false) {
        for (const key of ['display.baseTint', 'display.accent']) if (key in delayed) { immediate[key] = delayed[key]; delete delayed[key]; }
      }
      // Enabling a personal palette belongs to the same edit as its first color.
      if ('display.customColors' in immediate && ('display.baseTint' in delayed || 'display.accent' in delayed)) {
        delayed['display.customColors'] = immediate['display.customColors']; delete immediate['display.customColors'];
      }
      if (Object.keys(delayed).length) autosave.update(delayed);
      if (Object.keys(immediate).length) autosave.update(immediate, 0);
    });
  });
  export async function close() {
    await tick();
    if (await autosave.flush()) onclose();
  }
  onDestroy(() => { void autosave.flush().then(saved => { if (!saved) toast.error(`Could not save settings: ${saveError}`); }); });
  function saveEditor(event: SubmitEvent) {
    event.preventDefault();
    if (editorValidation.success) draft.editor.executable = editorValidation.data;
  }
  async function importFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || importing) return;
    importing = true;
    try { await onimport(JSON.parse(await file.text())); toast.success('V-code catalog imported'); } catch (e) { toast.error(String(e)); }
    finally { importing = false; (event.target as HTMLInputElement).value = ''; }
  }
</script>

{#snippet fields(section: keyof Config, keys: string[], labels: Record<string, string> = {})}
  <ConfigFields value={draft[section]} schemas={configSchema.shape[section].unwrap().shape} fields={keys} {labels} onchange={(key, value) => (draft[section] as Record<string, unknown>)[key] = value} />
{/snippet}

<Modal title="Settings" onclose={() => void close()} oncancel={() => { if (bindingSettings?.cancelAssignment()) return; if (cinematic) colorUnlock?.cancel(); else void close(); }} {cinematic} wide floating fixedHeight layoutKey="settings">
  <SettingsLayout groups={visibleGroups} bind:value={tab} label="Settings sections">
    {#if tab === 'colors'}
      <ShellThemePicker bind:value={draft.display.shellTheme} customColors={draft.display.customColors} onchange={() => {
        draft.display.customColors = false;
        draft.display.baseTint = undefined;
        draft.display.accent = undefined;
      }} />
      {#if gameEnabled}<ColorUnlock bind:this={colorUnlock} bind:config={draft} bind:active={cinematic} onevent={oncolorevent} />
      {:else}<CustomShellColors bind:display={draft.display} onreset={() => { draft.display.customColors = false; draft.display.baseTint = undefined; draft.display.accent = undefined; }} />{/if}
    {:else if tab === 'background'}
      <BackgroundSettings bind:value={draft.display.background} />
    {:else if tab === 'interface'}
      <div class="grid gap-5">
        <div class="flex items-center justify-between gap-4 border-b border-border/50 pb-3">
          <Label for="serious-mode" class="leading-relaxed">Serious mode</Label>
          <Switch id="serious-mode" checked={!gameEnabled} onCheckedChange={value => draft.experience.mode = value ? 'review' : 'game'} />
        </div>
        {#if !isDemo}<TutorialSettings />{/if}
        {@render fields('display', gameEnabled ? [...(isDemo ? [] : ['showSplashScreen']), 'uiFontSize', 'uiLabelSize', 'reducedMotion'] : ['uiFontSize', 'uiLabelSize', 'reducedMotion'], { uiFontSize: 'UI font size', uiLabelSize: 'UI label size' })}
      </div>
    {:else if tab === 'diffs'}
      {@render fields('display', ['diffTheme', 'diffStyle', 'fileView', 'fontSize', 'lineHeight', 'weaponDisplay', 'showResolved', 'diffInlineMarkColor', 'diffInlineMarkBorderWidthPx'], { fontSize: 'Diff font size', weaponDisplay: 'Finding badges', fileView: 'Files', diffStyle: 'Layout', diffInlineMarkColor: 'Marked range color', diffInlineMarkBorderWidthPx: 'Marked range border width (px)' })}
    {:else if tab === 'files'}
      <FileListSettings bind:display={draft.display} />
      {@render fields('display', ['sidebarLeft', 'explorerVisible'], { sidebarLeft: 'Explorer & review selector on the left', explorerVisible: 'Show file tree' })}
    {:else if tab === 'navigation'}
      {@render fields('gameplay', ['autoScroll', 'scrollPxPerSecond', 'autoAdvance'], { scrollPxPerSecond: 'Scroll speed (px/s)', autoAdvance: 'Advance to the next unreviewed file after completion' })}
    {:else if tab === 'editor'}
      {#if isDemo}
        <p class="text-sm text-muted-foreground">Opening files in an editor is available when running Meat Proxy locally.</p>
      {:else}
        <div class="grid gap-5">
          <div class="flex items-center justify-between gap-4"><Label for="editor-enabled">Enable VS Code / editor button</Label><Switch id="editor-enabled" bind:checked={draft.editor.enabled} aria-describedby="editor-enabled-help" /></div>
          <p id="editor-enabled-help" class="text-sm text-muted-foreground">Opens the current working file, including when viewing an older diff.</p>
          <form class="grid gap-2" onsubmit={saveEditor}>
            <Label for="editor-executable">Editor executable</Label>
            <InputGroup.Root>
              <InputGroup.Input id="editor-executable" bind:value={editorExecutable} disabled={!draft.editor.enabled} placeholder="Visual Studio Code (automatic)" spellcheck={false} aria-invalid={!editorValidation.success} aria-describedby="editor-executable-help" />
              <InputGroup.Addon align="inline-end"><InputGroup.Button type="submit" aria-label="Save editor executable" disabled={!draft.editor.enabled || !editorValidation.success || editorValidation.data === draft.editor.executable}><Save />Save</InputGroup.Button></InputGroup.Addon>
            </InputGroup.Root>
            {#if !editorValidation.success}<p class="text-xs text-destructive" role="alert">{editorValidation.error.issues[0].message}</p>{/if}
            <p id="editor-executable-help" class="text-sm text-muted-foreground">Leave empty for VS Code, or enter an executable name or path without quotes or arguments. macOS also accepts .app paths.</p>
          </form>
        </div>
      {/if}
    {:else if tab === 'hud'}
      <div class="mb-6"><HudTintControl value={draft.hud.tintStrength} onchange={value => draft.hud.tintStrength = value} /></div>
      {@render fields('hud', ['titleSize', 'alwaysShowCode', 'navigatorEnabled'], { titleSize: 'HUD title size', alwaysShowCode: 'Always show code examples', navigatorEnabled: 'Enable V-code navigator' })}
      <div class="mt-5 flex items-center justify-between gap-4"><Label for="always-show-navigator">Always show navigator</Label><Switch id="always-show-navigator" bind:checked={draft.hud.navigatorAlwaysVisible} disabled={!draft.hud.navigatorEnabled} /></div>
    {:else if tab === 'notifications'}
      <div class="grid gap-5">
        {#if gameEnabled}{@render fields('transmissions', ['enabled'], { enabled: 'Show transmissions' })}{/if}
        <SingleSelect label="Notification corner" value={draft.display.toastPosition}
          options={([{ value: 'bottom-left', label: 'Bottom left' }, { value: 'bottom-right', label: 'Bottom right' }, { value: 'top-left', label: 'Top left' }, { value: 'top-right', label: 'Top right' }])}
          onchange={value => draft.display.toastPosition = value as Config['display']['toastPosition']} />
        {@render fields('display', ['toastMs'], { toastMs: 'Notification duration (ms)' })}
        <Button variant="outline" class="justify-self-start" onclick={() => toast.success('Notification preview', { description: 'Your review updates appear here.', position: draft.display.toastPosition, duration: draft.display.toastMs, id: 'notification-preview' })}>Preview notification</Button>
      </div>
    {:else if tab === 'sound'}
      {@render fields('gameplay', ['sound', 'adlibs', 'volume'], { sound: 'Sound effects', adlibs: 'Character ad-libs', volume: 'Sound volume' })}
    {:else if tab === 'destruction'}
      <h3 class="mb-4 text-sm font-semibold">File health & target</h3>
      {@render fields('destruction', ['shotsToComplete', 'borderStyle'], { shotsToComplete: 'Hits to complete a file', borderStyle: 'Target border' })}
    {:else if tab === 'weapons'}
      <div class="grid gap-6">
        <WeaponPicker label="Primary weapon" ariaLabel="Primary weapon" bind:value={draft.weapons.mainModel} config={draft} allowInherit={false} />
        <WeaponPicker label="Secondary weapon" ariaLabel="Secondary weapon" bind:value={draft.weapons.secondaryModel} config={draft} allowInherit={false} />
        <Button variant="outline" class="w-full justify-between" onclick={() => browsingArmory = true}><span class="flex items-center gap-2"><Crosshair class="size-4" />Browse armory</span><ArrowUpRight class="size-4 text-muted-foreground" /></Button>
        <details class="rounded-md border border-border p-4">
          <summary class="cursor-pointer text-sm font-medium">Gloves & lettering</summary>
          <div class="mt-4">{@render fields('gloves', Object.keys(configSchema.shape.gloves.unwrap().shape), { enabled: 'Show gloves', mainText: 'Primary lettering', altText: 'Secondary lettering' })}</div>
        </details>
      </div>
    {:else if tab === 'crosshair'}
      <div class="grid gap-7">
        <CrosshairPicker bind:value={draft.crosshair} />
        <section class="grid gap-4 border-t border-border/60 pt-6">
          <h3 class="text-sm font-semibold">Shooting targets</h3>
          <TargetPicker bind:value={draft.targets.artwork} config={draft} />
        </section>
      </div>
    {:else if tab === 'controls'}
      <KeyBindingSettings bind:this={bindingSettings} config={draft} />
    {:else if tab === 'catalog'}
      <input hidden type="file" accept=".json,application/json" bind:this={fileInput} onchange={importFile} aria-label="Import V-code catalog" />
      <div class="flex items-center gap-2">
        <Button variant="outline" size="lg" disabled={importing} onclick={() => fileInput?.click()}><Upload size={15} />{importing ? 'Importing…' : 'Import V-codes'}</Button>
        <Button href={assetUrl('/schemas/catalog.schema.json')} download variant="outline" size="lg"><FileCode size={15} />Get schema</Button>
      </div>
    {:else if tab === 'export'}
      {@render fields('export', ['includeCatalog', 'includeExamples', 'includeResolved'], { includeCatalog: 'Include full V-code catalog', includeExamples: 'Include bad / good examples', includeResolved: 'Include resolved findings' })}
      {#if !isDemo}
        <div class="mt-6 space-y-3 border-t border-border pt-5">
          <div class="flex items-center justify-between gap-4"><Label for="dispatch-auto-copy-setting">Automatically copy agent instructions</Label><Switch id="dispatch-auto-copy-setting" bind:checked={draft.dispatch.autoCopyInstructions} aria-describedby="dispatch-auto-copy-help" /></div>
          <p id="dispatch-auto-copy-help" class="text-sm text-muted-foreground">Skip the outbox dialog when instructions are copied successfully.</p>
        </div>
      {/if}
    {/if}
  </SettingsLayout>
  {#if !validation.success}<p class="shrink-0 px-6 pt-3 text-sm text-destructive" role="alert">{validation.error.issues[0].path.map(part => words(String(part))).join(' → ')}: {validation.error.issues[0].message}</p>{/if}
  <PanelFooter data-autosave-status={saveStatus}>
    {#if saveError}
      <p class="text-sm text-destructive" role="alert">Could not save settings: {saveError}</p>
      <Button variant="outline" size="sm" onclick={() => void autosave.flush()}>Retry</Button>
    {/if}
  </PanelFooter>
</Modal>

{#if browsingArmory && gameEnabled}
  <WeaponArmory weapons={modelOptions([draft.weapons.mainModel, draft.weapons.secondaryModel], draft.weapons.availableModels)} reducedMotion={draft.display.reducedMotion} onclose={() => browsingArmory = false} />
{/if}
