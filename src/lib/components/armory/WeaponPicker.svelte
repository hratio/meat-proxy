<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import { Crosshair } from '@lucide/svelte';
  import type { Config } from '$lib/config';
  import { modelOptions } from '$lib/weapons/catalog';
  import * as ButtonGroup from '$lib/components/ui/button-group';
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select';
  import { Label } from '$lib/components/ui/label';
  import Hint from '$lib/components/Hint.svelte';
  import WeaponArmory from './WeaponArmory.svelte';

  let { value = $bindable(''), config, onchange, inherited = 'Weapon slot default', inheritedValue, allowInherit = true, compact = false, disabled = false, label, ariaLabel = 'Assign weapon' }: {
    value?: string; config: Config; onchange?: (value: string) => void;
    inherited?: string; inheritedValue?: string; allowInherit?: boolean; compact?: boolean; disabled?: boolean;
    label?: string; ariaLabel?: string;
  } = $props();
  const id = $props.id();
  const inheritOption = '__inherit__';
  let open = $state(false);
  let selectOpen = $state(false);
  let models = $derived(modelOptions([config.weapons.mainModel, config.weapons.secondaryModel, value, inheritedValue ?? ''], config.weapons.availableModels));
  let selected = $derived(models.find(model => model.value === value)?.label ?? inherited);

  function change(next: string) {
    if (disabled) return;
    if (onchange) onchange(next);
    else value = next;
    open = false;
  }
</script>

<div class={`grid min-w-0 gap-2 ${compact ? 'w-[210px] max-w-full' : 'w-full'}`} data-weapon-picker>
  {#if label}<Label for={id} class="text-xs text-muted-foreground">{label}</Label>{/if}
  <ButtonGroup.Root class="w-full" aria-label={ariaLabel}>
    <Select.Root type="single" bind:open={selectOpen} value={value || (allowInherit ? inheritOption : '')} onValueChange={next => change(next === inheritOption ? '' : next)} {disabled}>
      <Select.Trigger {id} aria-label={ariaLabel} size={label ? 'lg' : 'default'} class="min-w-0 flex-1">
        <span class="truncate">{selected}</span>
      </Select.Trigger>
      <!-- A fresh floating layer also handles Escape/reopen during the close animation. -->
      {#if selectOpen}
        <Select.Content class="min-w-64 max-w-[calc(100vw-32px)]">
          {#if allowInherit}<Select.Item value={inheritOption} label={inherited}>{inherited}</Select.Item><Select.Separator />{/if}
          {#each models as model (model.value)}<Select.Item value={model.value} label={model.label}>{model.label}</Select.Item>{/each}
        </Select.Content>
      {/if}
    </Select.Root>
      <Hint text="Browse armory">
        {#snippet children({ props })}
          <Button {...mergeProps(props, { onclick: () => open = true })} variant="outline" size={label ? 'icon-lg' : 'icon'} {disabled} aria-label={`Browse armory: ${ariaLabel.toLowerCase()}`} aria-haspopup="dialog" aria-expanded={open}><Crosshair class={value ? 'text-primary' : ''} /></Button>
        {/snippet}
      </Hint>
  </ButtonGroup.Root>
</div>

{#if open}
  <WeaponArmory value={value || inheritedValue || config.weapons.mainModel} weapons={models} reducedMotion={config.display.reducedMotion} onselect={change} onclose={() => open = false} />
{/if}
