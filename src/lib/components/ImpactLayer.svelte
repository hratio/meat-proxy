<script lang="ts">
  import { onMount } from 'svelte';
  import type { Config } from '$lib/config';

  let { config }: { config: Config } = $props();
  let wall: HTMLCanvasElement;
  let debris: HTMLCanvasElement;
  let wallContext: CanvasRenderingContext2D | null;
  let debrisContext: CanvasRenderingContext2D | null;
  type Chip = { x: number; y: number; vx: number; vy: number; floor: number; size: number; angle: number; turn: number; shade: string };
  type Dust = { x: number; y: number; size: number; stretch: number; angle: number };
  type Impact = { at: number; life: number; x: number; y: number; chips: Chip[]; dust: Dust[] };
  type BulletHole = { x: number; y: number; angle: number; size: number; image: HTMLCanvasElement; fadeAt: number; fadeMs: number };
  let impacts: Impact[] = [], holes: BulletHole[] = [];
  let frame = 0, last = 0, width = 0, height = 0;
  const random = (min: number, max: number) => min + Math.random() * (max - min);

  function bulletTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ink = canvas.getContext('2d')!;
    ink.translate(64, 64); ink.scale(48, 48);

    const chippedShape = (vertices: number, inner: number, outer: number, tear = false) => {
      const shape = new Path2D();
      const tornEdge = Math.floor(Math.random() * vertices);
      for (let i = 0; i < vertices; i++) {
        const angle = i / vertices * Math.PI * 2;
        const radius = random(inner, outer) * (tear && i === tornEdge ? 1.5 : 1);
        const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * .88;
        if (!i) shape.moveTo(x, y); else shape.lineTo(x, y);
      }
      shape.closePath();
      return shape;
    };
    const rim = chippedShape(24, .55, .83);
    const hole = chippedShape(14, .19, .26, true);

    const scorch = ink.createRadialGradient(0, 0, .18, 0, 0, 1.12);
    scorch.addColorStop(0, '#020302bc');
    scorch.addColorStop(.6, '#07090778');
    scorch.addColorStop(1, '#07090700');
    ink.fillStyle = scorch; ink.fillRect(-1.2, -1.2, 2.4, 2.4);

    const fractures = new Path2D();
    const fractureCount = Math.floor(random(3, 6));
    for (let i = 0; i < fractureCount; i++) {
      const angle = random(0, Math.PI * 2), length = random(.8, 1.15);
      fractures.moveTo(Math.cos(angle) * .22, Math.sin(angle) * .22);
      fractures.lineTo(Math.cos(angle + .12) * .52, Math.sin(angle + .12) * .52);
      fractures.lineTo(Math.cos(angle - .07) * length, Math.sin(angle - .07) * length);
    }
    ink.lineWidth = .035; ink.strokeStyle = '#040503c9'; ink.stroke(fractures);

    const bevel = ink.createLinearGradient(-.4, -.8, .4, .8);
    bevel.addColorStop(0, '#11140ff0');
    bevel.addColorStop(.45, '#45473bcc');
    bevel.addColorStop(1, '#89836ba6');
    ink.fillStyle = bevel; ink.fill(rim);

    for (let i = 0; i < 11; i++) {
      const angle = random(0, Math.PI * 2), radius = random(.37, .66);
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * .88;
      ink.fillStyle = i % 3 ? '#10130b75' : '#c0b99b55';
      ink.beginPath(); ink.moveTo(x, y);
      ink.lineTo(x + Math.cos(angle + .4) * .2, y + Math.sin(angle + .4) * .2);
      ink.lineTo(x + Math.cos(angle - .3) * .12, y + Math.sin(angle - .3) * .12);
      ink.fill();
    }

    const recess = ink.createRadialGradient(-.04, -.05, .08, 0, 0, .65);
    recess.addColorStop(0, '#000100');
    recess.addColorStop(.48, '#050704f5');
    recess.addColorStop(1, '#05070400');
    ink.fillStyle = recess; ink.fill(rim);
    ink.fillStyle = '#010200'; ink.fill(hole);
    ink.save(); ink.translate(.015, .025);
    ink.lineWidth = .025; ink.strokeStyle = '#aea58b65'; ink.stroke(hole); ink.restore();
    ink.fillStyle = '#010200'; ink.fill(hole);
    return canvas;
  }

  export function clear() { impacts = []; holes = []; }

  export function fire(x: number, y: number, background: boolean, secondary: boolean) {
    if (!wallContext || !debrisContext) return;
    const settings = config.gameplay;
    const at = performance.now();
    const radius = settings.impactRadiusPx;
    const bias = random(-.7, .7);
    if (!config.display.reducedMotion) impacts.push({
      at, life: settings.hitLifetimeMs, x, y,
      chips: Array.from({ length: settings.impactParticles }, () => ({
        x, y, vx: (random(-1, 1) + bias) * radius * 3,
        vy: -random(1.5, 4) * radius, floor: y + random(.12, .7) * radius,
        size: random(1.1, 3.8), angle: random(0, Math.PI), turn: random(-10, 10),
        shade: ['#807a68', '#a29a83', '#514f45', '#b8af98'][Math.floor(Math.random() * 4)]
      })),
      dust: Array.from({ length: settings.impactDust }, () => ({
        x: random(-.6, .6) * radius, y: -random(.2, .9) * radius,
        size: random(.22, .48) * radius, stretch: random(1.1, 2.2), angle: random(-.6, .6)
      }))
    });
    impacts = impacts.slice(-settings.impactLimit);
    if (background && settings.decalLimit) {
      const size = secondary ? config.weapons.secondaryProjectileSize : config.weapons.mainProjectileSize;
      const weight = secondary ? config.weapons.secondaryProjectileWeight : config.weapons.mainProjectileWeight;
      // Bake the chipped surface once per hit; fading only redraws this small sprite.
      holes.push({ x, y, image: bulletTexture(), angle: random(-Math.PI, Math.PI), size: settings.decalSizePx * size * Math.sqrt(weight) * random(.9, 1.1), fadeAt: at + settings.decalLifetimeMs, fadeMs: settings.decalFadeMs });
      const active = holes.filter(hole => hole.fadeAt > at);
      for (const hole of active.slice(0, Math.max(0, active.length - settings.decalLimit))) hole.fadeAt = at;
      holes = holes.slice(-Math.ceil(settings.decalLimit * 1.25));
    }
    if (!frame) { last = at; frame = requestAnimationFrame(paint); }
  }

  function paint(time: number) {
    frame = 0;
    if (!wallContext || !debrisContext || document.hidden) return;
    if (time - last < 1000 / config.weapons.fps) { frame = requestAnimationFrame(paint); return; }
    const dt = Math.min((time - last) / 1000, .05);
    last = time;
    const wall = wallContext, dust = debrisContext;
    wall.clearRect(0, 0, width, height);
    dust.clearRect(0, 0, width, height);
    holes = holes.filter(hole => time < hole.fadeAt + hole.fadeMs);
    for (const hole of holes) {
      wall.save();
      wall.globalAlpha = Math.min(1, Math.max(0, 1 - (time - hole.fadeAt) / hole.fadeMs));
      wall.translate(hole.x, hole.y); wall.rotate(hole.angle);
      wall.drawImage(hole.image, -hole.size / 2, -hole.size / 2, hole.size, hole.size);
      wall.restore();
    }
    impacts = impacts.filter(impact => time - impact.at < impact.life);
    for (const impact of impacts) {
      // Input can arrive after this frame's timestamp during a slow GPU frame.
      const age = Math.max(0, Math.min(1, (time - impact.at) / impact.life));
      for (const cloud of impact.dust) {
        dust.save();
        dust.translate(impact.x + cloud.x * age, impact.y + cloud.y * age);
        dust.rotate(cloud.angle); dust.scale(cloud.stretch, 1);
        const size = cloud.size * (.3 + age);
        const mist = dust.createRadialGradient(0, 0, 0, 0, 0, size);
        mist.addColorStop(0, `rgba(154, 145, 122, ${.16 * (1 - age)})`);
        mist.addColorStop(1, 'rgba(154, 145, 122, 0)');
        dust.fillStyle = mist; dust.fillRect(-size, -size, size * 2, size * 2);
        dust.restore();
      }
      for (const chip of impact.chips) {
        chip.vy += config.gameplay.impactGravity * dt;
        chip.x += chip.vx * dt; chip.y += chip.vy * dt;
        if (chip.y > chip.floor && chip.vy > 0) {
          chip.y = chip.floor; chip.vy *= -config.gameplay.impactBounce; chip.vx *= .6; chip.turn *= .5;
        }
        chip.angle += chip.turn * dt;
        dust.save(); dust.translate(chip.x, chip.y); dust.rotate(chip.angle);
        dust.globalAlpha = Math.min(1, (1 - age) * 3);
        dust.fillStyle = chip.shade;
        dust.beginPath(); dust.moveTo(-chip.size, 0); dust.lineTo(0, -chip.size * .65);
        dust.lineTo(chip.size * .6, 0); dust.lineTo(chip.size * .25, chip.size * .6); dust.fill();
        dust.restore();
      }
    }
    if (impacts.length || holes.length) frame = requestAnimationFrame(paint);
  }

  onMount(() => {
    wallContext = wall.getContext('2d'); debrisContext = debris.getContext('2d');
    const resize = () => {
      width = innerWidth; height = innerHeight;
      const ratio = Math.min(devicePixelRatio, config.weapons.pixelRatio);
      for (const canvas of [wall, debris]) { canvas.width = width * ratio; canvas.height = height * ratio; canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0); }
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const resume = () => { if (!document.hidden && !frame && (impacts.length || holes.length)) { last = performance.now(); frame = requestAnimationFrame(paint); } };
    resize();
    window.addEventListener('resize', resize); document.addEventListener('visibilitychange', resume);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', resume); };
  });
</script>

<canvas class="background-scars pointer-events-none fixed inset-0 z-0 size-full" bind:this={wall} aria-hidden="true"></canvas>
<canvas class="impact-debris pointer-events-none fixed inset-0 z-70 size-full" bind:this={debris} aria-hidden="true"></canvas>
