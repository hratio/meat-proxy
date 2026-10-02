/**
 * @typedef {{ temperature: number, amberReduction: number, warmShift: number,
 * warmHue: number, shadowBlue: number, saturation: number, exposure: number,
 * contrast: number }} ColorGrade
 */

export const controls = [
  { key: 'temperature', label: 'Cool balance', min: -100, max: 100, step: 1, value: 0, hint: 'Warm ← → cool' },
  { key: 'amberReduction', label: 'Reduce amber', min: 0, max: 100, step: 1, value: 0, hint: 'Softens yellow and orange saturation' },
  { key: 'warmShift', label: 'Recolor warm areas', min: 0, max: 100, step: 1, value: 0, hint: 'Blends red, orange and yellow toward the hue below' },
  { key: 'warmHue', label: 'Warm areas → hue', min: 0, max: 360, step: 1, value: 350, hint: '0 red · 210 blue · 350 crimson', unit: '°' },
  { key: 'shadowBlue', label: 'Blue in shadows', min: 0, max: 100, step: 1, value: 0, hint: 'Adds blue to dark detail; black stays black' },
  { key: 'saturation', label: 'Overall saturation', min: -100, max: 50, step: 1, value: 0, hint: 'Muted ← → vivid' },
  { key: 'exposure', label: 'Exposure', min: -1.5, max: 1.5, step: .01, value: 0, hint: 'Darker ← → brighter', unit: ' EV' },
  { key: 'contrast', label: 'Contrast', min: -40, max: 40, step: 1, value: 0, hint: 'Soft ← → defined' },
];

export const neutral = Object.fromEntries(controls.map(control => [control.key, control.value]));
export const presets = {
  'Cool city': { ...neutral, temperature: 40, amberReduction: 45, warmShift: 35, shadowBlue: 24, saturation: -12, exposure: -.1, contrast: 3 },
  'Steel & crimson': { ...neutral, temperature: 55, amberReduction: 65, warmShift: 65, shadowBlue: 35, saturation: -18, exposure: -.18, contrast: 5 },
  'Blue embers': { ...neutral, temperature: 45, amberReduction: 25, warmHue: 212, warmShift: 80, shadowBlue: 30, saturation: -10, exposure: -.08, contrast: 3 },
  'Original': { ...neutral },
};

/** @returns {ColorGrade} */
export function validateGrade(value) {
  if (!value || typeof value !== 'object') throw new Error('Missing layer adjustments.');
  const result = {};
  for (const control of controls) {
    const number = value[control.key];
    if (!Number.isFinite(number) || number < control.min || number > control.max) throw new Error(`Invalid ${control.label}.`);
    result[control.key] = number;
  }
  return result;
}

// The workshop, PNG writer and offline LUT generator use this function. Input/output are
// unassociated 8-bit sRGB RGBA. Alpha and fully transparent pixels are untouched.
/**
 * @param {Uint8Array | Uint8ClampedArray | Float32Array} pixels
 * @param {ColorGrade} settings
 */
export function gradePixels(pixels, settings) {
  const cool = settings.temperature / 100;
  const amberReduction = settings.amberReduction / 100;
  const shift = settings.warmShift / 100;
  const shadow = settings.shadowBlue / 100;
  const saturation = 1 + settings.saturation / 100;
  const exposure = 2 ** settings.exposure;
  const contrast = 1 + settings.contrast / 100;
  if (!cool && !amberReduction && !shift && !shadow && saturation === 1 && exposure === 1 && contrast === 1) return pixels;
  const smooth = (low, high, value) => {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    let r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    const lightness = (max + min) / 2;
    let hue = 0, sat = 0;
    if (delta) {
      sat = delta / (1 - Math.abs(2 * lightness - 1));
      hue = (max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60;
      if (hue < 0) hue += 360;
    }
    // Masks come from the source color, so changing one slider does not move
    // the selection used by another. Neutrals retain their metallic detail.
    const chroma = smooth(.08, .4, sat);
    const warm = chroma * (hue < 180 ? 1 - smooth(55, 85, hue) : smooth(325, 355, hue));
    const amber = chroma * smooth(0, 18, hue) * (1 - smooth(58, 88, hue));
    const angle = ((settings.warmHue - hue + 540) % 360) - 180;
    hue = (hue + angle * warm * shift + 360) % 360;
    sat = Math.max(0, Math.min(1, sat * (1 - amber * amberReduction) * saturation));
    const c = (1 - Math.abs(2 * lightness - 1)) * sat;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = lightness - c / 2;
    if (hue < 60) { r = c; g = x; b = 0; }
    else if (hue < 120) { r = x; g = c; b = 0; }
    else if (hue < 180) { r = 0; g = c; b = x; }
    else if (hue < 240) { r = 0; g = x; b = c; }
    else if (hue < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    r += m; g += m; b += m;
    const luminance = r * .2126 + g * .7152 + b * .0722;
    const darkDetail = 4 * luminance * (1 - luminance) ** 2 * shadow;
    r += -.12 * cool * luminance - .08 * darkDetail;
    g += .005 * cool * luminance + .04 * darkDetail;
    b += .14 * cool * luminance + .28 * darkDetail;
    pixels[i] = Math.max(0, Math.min(255, Math.round(((r * exposure - .5) * contrast + .5) * 255)));
    pixels[i + 1] = Math.max(0, Math.min(255, Math.round(((g * exposure - .5) * contrast + .5) * 255)));
    pixels[i + 2] = Math.max(0, Math.min(255, Math.round(((b * exposure - .5) * contrast + .5) * 255)));
  }
  return pixels;
}
