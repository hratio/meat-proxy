<script lang="ts">
  let { label, min = 0, max, step = 1, value, onseek }: {
    label: string; min?: number; max: number; step?: number; value: number;
    onseek: (value: number) => void;
  } = $props();
  let progress = $derived(Math.max(0, Math.min(100, (value - min) / Math.max(Number.EPSILON, max - min) * 100)));
</script>

<!-- Bits UI eagerly builds every tick on value updates. Long timelines use a
     native range so playback and seeking stay constant-cost at 1 ms precision. -->
<input type="range" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
  {min} {max} {step} {value} data-ui-control="" data-cursor="native"
  class="timeline-scrubber" style:--progress={`${progress}%`}
  oninput={event => onseek(event.currentTarget.valueAsNumber)} />

<style>
  .timeline-scrubber { display: block; width: 100%; height: 16px; margin: 0; padding: 0; border: 0; cursor: pointer; appearance: none; background: transparent; touch-action: pan-y; }
  .timeline-scrubber::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: linear-gradient(to right, var(--primary) var(--progress), var(--muted) var(--progress)); }
  .timeline-scrubber::-moz-range-track { height: 4px; border-radius: 999px; background: var(--muted); }
  .timeline-scrubber::-moz-range-progress { height: 4px; border-radius: 999px; background: var(--primary); }
  .timeline-scrubber::-webkit-slider-thumb { width: 12px; height: 12px; margin-top: -4px; border: 1px solid var(--ring); border-radius: 50%; appearance: none; background: var(--foreground); }
  .timeline-scrubber::-moz-range-thumb { width: 12px; height: 12px; border: 1px solid var(--ring); border-radius: 50%; background: var(--foreground); }
  .timeline-scrubber:focus-visible { border-radius: 4px; outline: 2px solid var(--ring); outline-offset: 4px; }
</style>
