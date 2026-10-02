<script lang="ts">
  import { configSchema, type Config } from '$lib/config';
  import { weaponProfileSchema, weaponSoundSchema, weaponEffectsSchema, fallbackWeaponProfile } from '$lib/weapons/profiles';
  import { weaponCatalog } from '$lib/weapons/catalog';
  import ConfigFields from '$lib/components/settings/ConfigFields.svelte';
  import SingleSelect from '$lib/components/SingleSelect.svelte';
  import WeaponPicker from '$lib/components/armory/WeaponPicker.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Plus, Trash2 } from '@lucide/svelte';

  let { config = $bindable(), page }: { config: Config; page: string } = $props();
  let selectedProfile = $state('');
  let profilePart = $state('behavior');
  let effectPart = $state('muzzle');
  let newModel = $state('');
  const profileId = $derived(selectedProfile in config.weapons.profiles ? selectedProfile : Object.keys(config.weapons.profiles)[0]);
  const profile = $derived(config.weapons.profiles[profileId]);
  const profileAsset = $derived(weaponCatalog.find(weapon => weapon.id === profileId || weapon.url === profileId));
  const profileOptions = $derived(Object.keys(config.weapons.profiles).map(value => ({ value, label: weaponCatalog.find(weapon => weapon.id === value || weapon.url === value)?.name ?? value })));
  const oscillationFields = ['sprayMinAngleDeg', 'sprayMaxAngleDeg', 'sprayPeriodMs'];
  const soundFields: Record<string, string[]> = {
    clips: ['shot', 'start', 'loop', 'stop'],
    timing: ['stopDelayMs', 'stopAfter', 'loopDelayMs', 'loopStartSec', 'loopEndSec'],
    mixing: ['attackMs', 'releaseMs', 'maxVoices', 'gain']
  };
  const effectFields: Record<string, string[]> = {
    muzzle: ['enabled', 'particleLimit', 'textureSize', 'muzzleSize', 'muzzleLight', 'plumeCount', 'plumeMs', 'smokeMs'],
    debris: ['debrisMs', 'ejectSpeed', 'ejectLift', 'debrisSize', 'gravity', 'tumbleSpeed'],
    projectiles: ['sludgeDrops', 'projectileSpeed', 'projectileMs', 'missilePodOffset', 'missileTrailMs']
  };
  function addProfile() {
    if (!newModel || config.weapons.profiles[newModel]) return;
    const bundled = weaponCatalog.find(weapon => weapon.url === newModel);
    config.weapons.profiles[newModel] = structuredClone($state.snapshot(config.weapons.profiles[bundled?.id ?? ''] ?? fallbackWeaponProfile));
    selectedProfile = newModel;
    newModel = '';
  }
</script>

<div class="grid min-w-0 gap-6">
  {#if page === 'weapon-loadout'}
    <WeaponPicker label="Primary weapon" ariaLabel="Studio primary weapon" bind:value={config.weapons.mainModel} {config} allowInherit={false} />
    <WeaponPicker label="Secondary weapon" ariaLabel="Studio secondary weapon" bind:value={config.weapons.secondaryModel} {config} allowInherit={false} />
  {:else if page === 'weapon-profiles'}
    {#if profile}
      <SingleSelect label="Weapon profile" value={profileId} options={profileOptions} onchange={next => selectedProfile = next} />
      <SingleSelect label="Profile settings" bind:value={profilePart} options={[{ value: 'behavior', label: 'Firing & movement' }, { value: 'clips', label: 'Sound clips' }, { value: 'timing', label: 'Sound timing' }, { value: 'mixing', label: 'Sound mixing' }]} />
      {#if profilePart === 'behavior'}
        <ConfigFields value={profile} schemas={weaponProfileSchema.shape}
          fields={Object.keys(weaponProfileSchema.shape).filter(key => key !== 'sound' && (key !== 'barrelRecoilScale' || profileAsset?.id === 'flaky-assertions') && (profile.sprayMode === 'oscillate' ? key !== 'sprayAngleDeg' : !oscillationFields.includes(key)) && (profile.effect === 'plasma' || !['chargeMs', 'chargeSize'].includes(key)))}
          labels={{ barrelRecoilScale: 'Barrel recoil travel', sprayRoll: 'Spray rotation', sprayMode: 'Spray motion', sprayDelayMs: 'Spray hold delay (ms)', sprayAngleDeg: 'Spray roll angle (degrees)', sprayMinAngleDeg: 'Minimum roll (degrees)', sprayMaxAngleDeg: 'Maximum roll (degrees)', sprayPeriodMs: 'Rocking cycle (ms)', chargeMs: 'Full charge time (ms)', chargeSize: 'Charged blast size', destructionRadiusPx: 'Destruction radius (px)' }}
          onchange={(key, value) => (profile as Record<string, unknown>)[key] = value} />
      {:else}
        <ConfigFields value={profile.sound} schemas={weaponSoundSchema.shape} fields={soundFields[profilePart]} onchange={(key, value) => (profile.sound as Record<string, unknown>)[key] = value} />
      {/if}
    {:else}<p class="text-sm text-muted-foreground">No custom profiles. Weapons use their bundled behavior until you add an override.</p>{/if}
    <details class="rounded-md border border-border p-4">
      <summary class="cursor-pointer text-sm font-medium">Add a model override</summary>
      <div class="mt-4 grid gap-4">
        <p class="text-xs text-muted-foreground">Creates an editable profile for this exact model URL, starting from its current weapon profile.</p>
        <WeaponPicker label="Model to override" ariaLabel="Model to override" bind:value={newModel} {config} allowInherit={false} />
        <Button variant="outline" disabled={!newModel || !!config.weapons.profiles[newModel]} onclick={addProfile}><Plus />Add profile</Button>
      </div>
    </details>
    {#if profile}<Button variant="outline" class="justify-self-start" onclick={() => { delete config.weapons.profiles[profileId]; selectedProfile = ''; }}><Trash2 />Remove profile override</Button>{/if}
  {:else if page === 'weapon-effects'}
    <SingleSelect label="Effect settings" bind:value={effectPart} options={[{ value: 'muzzle', label: 'Muzzle, smoke & limits' }, { value: 'debris', label: 'Debris physics' }, { value: 'projectiles', label: 'Special projectiles' }]} />
    <ConfigFields value={config.weapons.effects} schemas={weaponEffectsSchema.shape} fields={effectFields[effectPart]} onchange={(key, value) => (config.weapons.effects as Record<string, unknown>)[key] = value} />
  {:else if page === 'weapon-models'}
    {#each config.weapons.availableModels as model, index}
      <fieldset class="grid min-w-0 gap-4 rounded-md border border-border p-4">
        <legend class="px-2 text-sm font-medium">Custom weapon {index + 1}</legend>
        <ConfigFields value={model} schemas={configSchema.shape.weapons.unwrap().shape.availableModels.unwrap().element.shape} labels={{ name: 'Display name', model: 'Model URL' }} onchange={(key, value) => (model as Record<string, unknown>)[key] = value} />
        <Button variant="outline" class="justify-self-start" aria-label={`Remove custom weapon ${index + 1}`} onclick={() => config.weapons.availableModels.splice(index, 1)}><Trash2 />Remove</Button>
      </fieldset>
    {:else}<p class="text-sm text-muted-foreground">The bundled Armory is already available. Add a model here to extend it.</p>{/each}
    <Button variant="outline" class="justify-self-start" onclick={() => config.weapons.availableModels.push({ name: 'Custom weapon', model: '/models/custom.glb' })}><Plus />Add custom model</Button>
  {/if}
</div>
