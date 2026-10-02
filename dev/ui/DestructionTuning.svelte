<script lang="ts">
  import { destructionSchema, type DestructionSettings } from '$lib/destruction/config';
  import ConfigFields from '$lib/components/settings/ConfigFields.svelte';
  let { value = $bindable() }: { value: DestructionSettings } = $props();
</script>

<div class="grid gap-7">
  {#each [
    { title: 'Target color', fields: ['color'] },
    { title: 'Flying characters', fields: ['particleSpeed', 'particleSpeedVariation', 'particleSpreadDeg', 'particleLift', 'particleGravity', 'particleSpin'] },
    { title: 'Debris limits', fields: ['particleLimit', 'particleLifetimeMs'] }
  ] as section}
    <section class="grid gap-4">
      <h3 class="text-sm font-semibold">{section.title}</h3>
      <ConfigFields {value} schemas={destructionSchema.shape} fields={section.fields}
        labels={{ color: 'Destruction color', particleSpeed: 'Burst speed (px/s)', particleSpeedVariation: 'Speed variation (0–1)', particleSpreadDeg: 'Direction spread (degrees)', particleLift: 'Upward lift (px/s)', particleGravity: 'Gravity (px/s²)', particleSpin: 'Spin (turns/s)', particleLimit: 'Maximum flying characters', particleLifetimeMs: 'Character lifetime (ms)' }}
        onchange={(key, next) => (value as Record<string, unknown>)[key] = next} />
    </section>
  {/each}
</div>
