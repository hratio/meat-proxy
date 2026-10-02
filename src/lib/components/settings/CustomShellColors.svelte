<script lang="ts">
  import { tick } from 'svelte';
  import type { Config } from '$lib/config';
  import { readColorVariables } from '$lib/ui/user-colors';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  let { display = $bindable(), onreset }: { display: Config['display']; onreset?: () => void } = $props();
  const id = $props.id();
  let tint = $state('#99b58b'), accent = $state('#e9aa59');
  $effect(() => {
    display.shellTheme;
    const { customColors, baseTint, accent: customAccent } = display;
    let cancelled = false;
    // Wait for the theme's CSS variables to update before showing its colors.
    void tick().then(() => {
      if (cancelled) return;
      const [currentTint, currentAccent] = readColorVariables(document.documentElement, ['--ui-tint', '--primary']);
      tint = customColors ? baseTint ?? currentTint : currentTint;
      accent = customColors ? customAccent ?? currentAccent : currentAccent;
    });
    return () => { cancelled = true; };
  });
  function choose(key: 'baseTint' | 'accent', value: string) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    display[key] = value;
    display.customColors = true;
  }
</script>

<div class="grid gap-4 rounded-lg border border-border bg-card p-4 w-full" data-custom-shell-colors>
  <div>
    <p class="text-sm font-semibold">Customize colors</p>
    <p class="mt-1 text-xs text-muted-foreground">Tint this theme’s surfaces and choose an accent.</p>
  </div>
  {#each [{ key: 'baseTint', label: 'Base tint', value: tint }, { key: 'accent', label: 'Accent color', value: accent }] as field}
    <div class="grid grid-cols-[1fr_44px_100px] items-center gap-2">
      <Label for={`${id}-${field.key}`}>{field.label}</Label>
      <Input id={`${id}-${field.key}`} type="color" value={field.value} oninput={event => choose(field.key as 'baseTint' | 'accent', event.currentTarget.value)} />
      <Input aria-label={`${field.label} hex`} class="font-mono" maxlength={7} pattern="#[0-9a-fA-F]{6}" value={field.value}
        oninput={event => choose(field.key as 'baseTint' | 'accent', event.currentTarget.value)}
        onblur={event => event.currentTarget.value = field.value} />
    </div>
  {/each}
  {#if display.customColors && onreset}
    <div class="flex flex-wrap items-center gap-3 border-t border-border pt-4">
      <Button variant="outline" size="sm" onclick={onreset} aria-describedby={`${id}-reset-help`}>Reset custom colors</Button>
    </div>
  {/if}
</div>
