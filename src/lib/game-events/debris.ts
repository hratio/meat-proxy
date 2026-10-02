export const shatterDurationMs = 720;

/** Capture the local frames and portrait into triangular pieces; no DOM clones or extra WebGL contexts. */
export function shatterTransmission(canvas: HTMLCanvasElement, surface: HTMLElement, hit: { x: number; y: number }, paused = () => false) {
  const box = surface.getBoundingClientRect(), bounds = canvas.getBoundingClientRect();
  const snapshot = document.createElement('canvas');
  snapshot.width = Math.ceil(box.width); snapshot.height = Math.ceil(box.height);
  const ink = snapshot.getContext('2d')!, ctx = canvas.getContext('2d')!;
  const local = (element: Element) => {
    const r = element.getBoundingClientRect();
    return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
  };
  for (const frame of surface.querySelectorAll('[data-message-plate], [data-transmission-portrait] [data-frame="portrait"]')) {
    const r = local(frame), cut = 14;
    ink.beginPath(); ink.moveTo(r.x + cut, r.y); ink.lineTo(r.x + r.w - cut, r.y);
    ink.lineTo(r.x + r.w, r.y + cut); ink.lineTo(r.x + r.w, r.y + r.h - cut);
    ink.lineTo(r.x + r.w - cut, r.y + r.h); ink.lineTo(r.x + cut, r.y + r.h);
    ink.lineTo(r.x, r.y + r.h - cut); ink.lineTo(r.x, r.y + cut); ink.closePath();
    const metal = ink.createLinearGradient(0, r.y, 0, r.y + r.h);
    metal.addColorStop(0, '#737368'); metal.addColorStop(.08, '#242b25'); metal.addColorStop(.9, '#141c17'); metal.addColorStop(1, '#737368');
    ink.fillStyle = metal; ink.fill(); ink.strokeStyle = '#a4a18c'; ink.lineWidth = 2; ink.stroke();
  }
  const portrait = surface.querySelector<HTMLCanvasElement>('.portrait-canvas');
  if (portrait) {
    const r = local(portrait);
    ink.save(); ink.beginPath(); ink.roundRect(r.x, r.y, r.w, r.h, 8); ink.clip();
    ink.drawImage(portrait, r.x, r.y, r.w, r.h); ink.restore();
  }
  for (const element of surface.querySelectorAll<HTMLElement>('[data-fragment-text]')) {
    const r = local(element), style = getComputedStyle(element), line = parseFloat(style.lineHeight) || 20;
    ink.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`; ink.fillStyle = style.color; ink.textBaseline = 'top';
    let text = '', y = r.y;
    for (const word of (element.textContent || '').split(/\s+/)) {
      const next = text ? `${text} ${word}` : word;
      if (text && ink.measureText(next).width > r.w) { ink.fillText(text, r.x, y); y += line; text = word; } else text = next;
    }
    ink.fillText(text, r.x, y);
  }
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(bounds.width * ratio); canvas.height = Math.ceil(bounds.height * ratio);
  ctx.scale(ratio, ratio);
  const pieces: { path: Path2D; x: number; y: number; vx: number; vy: number; spin: number }[] = [];
  const cols = 6, rows = 5, w = box.width / cols, h = box.height / rows;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) for (let half = 0; half < 2; half++) {
    const x = col * w, y = row * h, cx = x + w / 2, cy = y + h / 2;
    const path = new Path2D();
    path.moveTo(x, half ? y + h : y); path.lineTo(x + w, y + h); path.lineTo(half ? x : x + w, y); path.closePath();
    const dx = box.left + cx - hit.x, dy = box.top + cy - hit.y, length = Math.max(1, Math.hypot(dx, dy));
    pieces.push({ path, x: cx, y: cy, vx: dx / length * (110 + Math.random() * 200), vy: dy / length * (100 + Math.random() * 190) - 110, spin: (Math.random() - .5) * 7 });
  }
  let frame = 0;
  let last = performance.now(), elapsed = 0;
  const paint = (time: number) => {
    const delta = Math.min(50, Math.max(0, time - last)); last = time;
    if (paused()) { frame = requestAnimationFrame(paint); return; }
    elapsed += delta;
    const age = elapsed / 1000;
    ctx.clearRect(0, 0, bounds.width, bounds.height);
    if (elapsed >= shatterDurationMs) return;
    ctx.globalAlpha = Math.max(0, Math.min(1, (shatterDurationMs - elapsed) / 280));
    for (const p of pieces) {
      ctx.save();
      ctx.translate(box.left - bounds.left + p.x + p.vx * age, box.top - bounds.top + p.y + p.vy * age + 480 * age * age);
      ctx.rotate(p.spin * age); ctx.translate(-p.x, -p.y); ctx.clip(p.path); ctx.drawImage(snapshot, 0, 0); ctx.restore();
    }
    frame = requestAnimationFrame(paint);
  };
  frame = requestAnimationFrame(paint);
  return () => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, bounds.width, bounds.height); };
}
