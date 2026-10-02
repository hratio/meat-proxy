<script lang="ts" module>
  // Fixed-scale SVG material marks, with no per-frame noise or filter passes.
  let seed = 841;
  const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  const grit = Array.from({ length: 235 }, () => {
    const x = random() * 192, y = random() * 192, size = .3 + random() * 1.7;
    return `M${x.toFixed(1)} ${y.toFixed(1)}l${size.toFixed(1)} -.4 .5 ${size.toFixed(1)}z`;
  }).join(' ');
  const brush = Array.from({ length: 92 }, () => {
    const x = random() * 192, y = random() * 192;
    return `M${x.toFixed(1)} ${y.toFixed(1)}h${(4 + random() * 58).toFixed(1)}`;
  }).join(' ');
</script>

<script lang="ts">
  let { id }: { id: string } = $props();
</script>

<defs>
    <linearGradient id={`${id}-edge-base`} x1="0" y1="0" x2=".3" y2="1">
      <stop stop-color="var(--hud-art-highlight)" />
      <stop offset=".07" stop-color="var(--hud-art-edge)" />
      <stop offset=".38" stop-color="var(--hud-art-metal)" />
      <stop offset=".84" stop-color="var(--hud-art-shadow)" />
      <stop offset="1" stop-color="var(--hud-art-edge)" />
    </linearGradient>
    <linearGradient id={`${id}-metal-base`} x1="0" y1="0" x2=".12" y2="1">
      <stop stop-color="var(--hud-art-top)" />
      <stop offset=".2" stop-color="var(--hud-art-metal)" />
      <stop offset=".72" stop-color="var(--hud-art-bottom)" />
      <stop offset="1" stop-color="var(--hud-art-metal)" />
    </linearGradient>
    <linearGradient id={`${id}-well-base`} x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="var(--hud-art-shadow)" />
      <stop offset=".19" stop-color="var(--hud-art-well-top)" />
      <stop offset="1" stop-color="var(--hud-art-well)" />
    </linearGradient>
    <radialGradient id={`${id}-bolt-base`} cx=".35" cy=".2" r=".8">
      <stop stop-color="var(--hud-art-highlight)" />
      <stop offset=".3" stop-color="var(--hud-art-edge)" />
      <stop offset=".7" stop-color="var(--hud-art-bottom)" />
      <stop offset="1" stop-color="var(--hud-art-shadow)" />
    </radialGradient>
    {#each ['edge', 'metal', 'well', 'bolt'] as material}
      <pattern id={`${id}-${material}`} width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox">
        <g style="isolation: isolate">
          <rect width="1" height="1" fill={`url(#${id}-${material}-base)`} />
        </g>
      </pattern>
    {/each}
    <pattern id={`${id}-grain`} width="192" height="192" patternUnits="userSpaceOnUse">
        <path d={brush} stroke="#030303" stroke-width=".7" opacity=".55" />
        <path d={brush} transform="translate(0 .6)" stroke="#a6a6a6" stroke-width=".35" opacity=".14" />
        <path d={grit} fill="#040404" opacity=".18" />
        <path d="M13 59h23m93 79h11m-67-25h18M150 18h22" stroke="#999999" stroke-width=".5" opacity=".3" />
    </pattern>
</defs>
