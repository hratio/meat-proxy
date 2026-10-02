<script lang="ts">
  import { garagePlacement } from '$lib/components/splash/driving-route';
  import { sequenceFrame, type Shot } from '$lib/components/splash/sequence-math';
  import type { LandscapeConfig } from '$lib/components/splash/landscape-config';
  let {
    landscape,
    time,
    aspect,
    shots,
    onseek
  }: {
    landscape: LandscapeConfig;
    time: number;
    aspect: number;
    shots: Shot[];
    onseek: (time: number) => void;
  } = $props();
  let current = $derived(sequenceFrame(time, landscape, aspect));
  let samples = $derived(
    Array.from({ length: 160 }, (_, i) =>
      sequenceFrame((i / 159) * shots.at(-1)!.end, landscape, aspect)
    )
  );
  let points = $derived(samples.map((frame) => [frame.camera[0] + frame.travel, frame.camera[2]]));
  let bounds = $derived.by(() => {
    const all = [...points, ...points.map(([x]) => [x, -139])];
    const minX = Math.min(...all.map((p) => p[0])) - 60,
      minZ = Math.min(...all.map((p) => p[1])) - 90;
    return {
      x: minX,
      z: minZ,
      width: Math.max(...all.map((p) => p[0])) - minX + 60,
      height: Math.max(...all.map((p) => p[1])) - minZ + 80
    };
  });
  const project = (x: number, z: number) => [
    24 + ((x - bounds.x) / bounds.width) * 552,
    20 + ((z - bounds.z) / bounds.height) * 270
  ];
  let cameraPath = $derived(points.map(([x, z]) => project(x, z).join(',')).join(' '));
  let camera = $derived(project(current.camera[0] + current.travel, current.camera[2]));
  let target = $derived(project(current.target[0] + current.travel, current.target[2]));
  let garage = $derived(garagePlacement(landscape));
  let entry=$derived(project(garage.x,garage.z));
</script>

<div class="overflow-hidden rounded-lg border border-border bg-[#101917]">
  <div
    class="flex justify-between border-b border-border px-3 py-2 font-mono text-[10px] text-muted-foreground"
  >
    <span>CAMERA PATH</span><span>Click a shot marker to seek</span>
  </div>
  <svg
    viewBox="0 0 600 315"
    class="block w-full"
    role="img"
    aria-label="Top-down route showing the shoreline, camera path and garage"
  >
    <rect x="0" y="0" width="600" height={Math.max(0, project(0, -139)[1])} fill="#262c26" />
    <text x="14" y="18" fill="#818978" font-size="10" font-family="monospace">CITY</text>
    <text x="14" y="300" fill="#597775" font-size="10" font-family="monospace">WATER</text>
    <line
      x1="0"
      x2="600"
      y1={project(0, -139)[1]}
      y2={project(0, -139)[1]}
      stroke="#6c7266"
      stroke-width="8"
    />
    <polyline points={cameraPath} fill="none" stroke="#d6aa68" stroke-width="1.5" stroke-dasharray="4 3" />
    {#each shots as shot, index}
      {@const f = sequenceFrame(shot.start, landscape, aspect)}
      {@const p = project(f.camera[0] + f.travel, f.camera[2])}
      <g
        role="button"
        tabindex="0"
        aria-label={`Seek ${shot.name}`}
        onclick={() => onseek(shot.start)}
        onkeydown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onseek(shot.start);
          }
        }}
        class="cursor-pointer outline-none focus:opacity-60"
      >
        <circle cx={p[0]} cy={p[1]} r="8" fill="#161c18" stroke="#a38351" />
        <text x={p[0]} y={p[1] + 3} text-anchor="middle" fill="#d6aa68" font-size="9">{index + 1}</text>
      </g>
    {/each}
    <line
      x1={camera[0]}
      y1={camera[1]}
      x2={camera[0] + (target[0] - camera[0]) * 0.2}
      y2={camera[1] + (target[1] - camera[1]) * 0.2}
      stroke="#ffe0a7"
      stroke-width="2"
    />
    <circle cx={camera[0]} cy={camera[1]} r="5" fill="#ffe0a7" />
    {#if landscape.sequence.enabled && landscape.sequence.garage.enabled}<rect x={entry[0]-5} y={entry[1]-5} width="10" height="10" fill="#73aeb0" />{/if}
  </svg>
  <div class="flex gap-4 px-3 pb-3 text-[10px] text-muted-foreground">
    <span class="text-[#ffe0a7]">● Camera</span><span class="text-[#73aeb0]">■ Garage</span><span
      >Camera height {current.camera[1].toFixed(1)} m</span
    >
  </div>
</div>
