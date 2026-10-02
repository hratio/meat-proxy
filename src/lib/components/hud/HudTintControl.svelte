<script lang="ts">
  import { Slider } from '$lib/components/ui/slider';
  let { value, onchange }: { value: number; onchange: (value: number) => void } = $props();
</script>

<div class="grid gap-3">
  <div class="flex justify-between gap-3 text-sm"><span>Theme tint strength</span><output class="tabular-nums text-muted-foreground">{Math.round(value * 100)}%</output></div>
  <Slider type="single" thumbLabel="Theme tint strength" min={0} max={100} step={1} value={value * 100} onValueChange={next => onchange(next / 100)} />
  <p class="text-xs leading-relaxed text-muted-foreground">Tint the black metal with your theme’s base color. Light strips always use the theme accent.</p>
</div>
