<script lang="ts">
  import { z } from 'zod';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import SingleSelect from '$lib/components/SingleSelect.svelte';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import { darkColorProfile, lightColorProfile } from '$lib/ui/user-colors';

  let { value, schemas, fields = Object.keys(schemas), labels = {}, onchange }: {
    value: Record<string, unknown>; schemas: Record<string, z.ZodType>; fields?: readonly string[];
    labels?: Record<string, string>; onchange: (key: string, value: unknown) => void;
  } = $props();
  const id = $props.id();
  const words = (key: string) => key.replace(/Ms$/, ' (ms)').replace(/Px$/, ' (px)').replace(/Sec$/, ' (seconds)').replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b.toLowerCase()}`).replace(/^./, c => c.toUpperCase());
  function unwrap(schema: z.ZodType): z.ZodType {
    while (schema instanceof z.ZodDefault || schema instanceof z.ZodPrefault || schema instanceof z.ZodOptional) schema = schema.unwrap() as z.ZodType;
    return schema;
  }
</script>

<div class="@container grid gap-5">
  {#each fields as key (key)}
    {@const schema = schemas[key]}
    {@const field = unwrap(schema)}
    {@const label = labels[key] ?? (key === 'showSplashScreen' ? 'Show intro' : words(key))}
    {@const inputId = `${id}-${key}`}
    {@const validation = schema.safeParse(value[key])}
    <div class="grid min-w-0 gap-2" data-setting={key}>
      {#if field instanceof z.ZodBoolean}
        <div class="flex items-center justify-between gap-4 border-b border-border/50 pb-3">
          <Label for={inputId} class="leading-relaxed">{label}</Label>
          <Switch id={inputId} checked={Boolean(value[key])} onCheckedChange={next => onchange(key, next)} />
        </div>
      {:else if field instanceof z.ZodEnum}
        <SingleSelect {label} value={String(value[key] ?? '')} options={field.options.map(option => ({ value: String(option), label: words(String(option)) }))} onchange={next => onchange(key, next)} />
      {:else}
        <div class="grid min-w-0 items-center gap-2 @min-[26rem]:grid-cols-[minmax(0,1fr)_minmax(0,12rem)] @min-[26rem]:gap-5">
          <Label for={inputId} class="leading-relaxed">{label}</Label>
          {#if field instanceof z.ZodNumber}
            <Input id={inputId} type="number" value={value[key] as number | undefined} min={field.minValue ?? undefined} max={field.maxValue ?? undefined} step={field.isInt ? 1 : 'any'} placeholder={schema instanceof z.ZodOptional ? 'Inherit default' : undefined} aria-invalid={!validation.success} oninput={event => onchange(key, event.currentTarget.value === '' ? undefined : Number(event.currentTarget.value))} />
          {:else if key === 'diffInlineMarkColor'}
            <ColorPicker id={inputId} {label} allowOpacity value={String(value[key])} profile={value.diffTheme === 'github-light' ? lightColorProfile : darkColorProfile} onchange={next => onchange(key, next)} />
          {:else}
            <Input id={inputId} type={/Color$|Tint$|^(metal|accent)$/.test(key) ? 'color' : 'text'} value={String(value[key] ?? '')} maxlength={field instanceof z.ZodString ? field.maxLength ?? undefined : undefined} placeholder={schema instanceof z.ZodOptional ? 'Not set' : undefined} aria-invalid={!validation.success} oninput={event => onchange(key, schema instanceof z.ZodOptional && !event.currentTarget.value ? undefined : event.currentTarget.value)} />
          {/if}
        </div>
      {/if}
      {#if key === 'showSplashScreen'}<p class="text-xs leading-relaxed text-muted-foreground">Applies next time you open or reload the app.</p>
      {:else if schema.description}<p class="text-xs leading-relaxed text-muted-foreground">{schema.description}</p>{/if}
      {#if !validation.success}<p class="text-xs text-destructive" role="alert">{validation.error.issues[0].message}</p>{/if}
    </div>
  {/each}
</div>
