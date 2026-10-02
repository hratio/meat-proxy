import type { PaintContext } from '../render/surface';

export const weaponTextureNames = ['flame', 'smoke', 'halo', 'key-W', 'key-A', 'key-S', 'key-D', 'key-F', 'key-Z'] as const;
export type WeaponTextureName = typeof weaponTextureNames[number];

export function paintWeaponTexture(name: WeaponTextureName, ctx: PaintContext, size: number) {
  if (name === 'flame') {
    ctx.scale(size, size);
    const fire = ctx.createLinearGradient(0, 0.95, 0, 0.06);
    fire.addColorStop(0, '#fff3bc'); fire.addColorStop(0.2, '#ffda79f2');
    fire.addColorStop(0.52, '#ff912bb8'); fire.addColorStop(0.8, '#f6531755'); fire.addColorStop(1, '#ee321000');
    ctx.fillStyle = fire; ctx.shadowColor = '#ff961caa'; ctx.shadowBlur = size * 0.045;
    for (let i = 0; i < 5; i++) {
      const lean = (i - 2) * 0.1, tip = 0.04 + Math.abs(i - 2) * 0.1;
      ctx.beginPath(); ctx.moveTo(0.49, 0.95);
      ctx.bezierCurveTo(0.3 + lean, 0.76, 0.58 + lean, 0.58, 0.46 + lean, tip);
      ctx.bezierCurveTo(0.69 + lean, 0.49, 0.54 + lean, 0.63, 0.58, 0.93);
      ctx.closePath(); ctx.fill();
    }
    const core = ctx.createLinearGradient(0, 0.96, 0, 0.45);
    core.addColorStop(0, '#ffffed'); core.addColorStop(0.4, '#ffeaa1cc'); core.addColorStop(1, '#ffb54b00');
    ctx.fillStyle = core; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(0.45, 0.97); ctx.quadraticCurveTo(0.46, 0.67, 0.5, 0.44);
    ctx.quadraticCurveTo(0.62, 0.7, 0.55, 0.96); ctx.closePath(); ctx.fill();
    const pixels = ctx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const grain = Math.sin(x * 0.79 + y * 0.33) * Math.sin(x * 0.31 - y * 0.43);
      pixels.data[(y * size + x) * 4 + 3] *= 0.78 + grain * 0.22;
    }
    ctx.putImageData(pixels, 0, 0);
    return;
  }
  if (name === 'smoke') {
    for (let i = 0; i < 16; i++) {
      const angle = i * 2.399, spread = size * 0.2 * Math.sin(i * 5.73);
      const x = size / 2 + Math.cos(angle) * spread, y = size / 2 + Math.sin(angle) * spread;
      const puff = ctx.createRadialGradient(x, y, 0, x, y, size * 0.25);
      puff.addColorStop(0, '#b5aa9428'); puff.addColorStop(1, '#b5aa9400');
      ctx.fillStyle = puff; ctx.fillRect(0, 0, size, size);
    }
    return;
  }
  if (name === 'halo') {
    const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, '#ffffff'); glow.addColorStop(0.15, '#ffffffdd'); glow.addColorStop(0.45, '#ffffff38'); glow.addColorStop(1, '#ffffff00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, size, size);
    return;
  }
  const letter = name.slice(4);
  ctx.fillStyle = '#c7d4ca'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#879a94'; ctx.lineWidth = size * 0.08; ctx.strokeRect(0, 0, size, size);
  ctx.fillStyle = '#1b2629'; ctx.font = `bold ${size * 0.6}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, size / 2, size * 0.52);
}
