import { DataTexture, LinearFilter, RepeatWrapping, RGBAFormat } from 'three';
import type { LandscapeConfig } from './landscape-config';

type Display = { radius: [number, number]; height: number };

/** The editor specifies an angle; the band UV measures distance along its ellipse. */
export function observatoryDisplayMetrics([rx, ry]: Display['radius']) {
  const samples = 4096, lengths = new Float64Array(samples + 1);
  let x = rx, y = 0;
  for (let i = 1; i <= samples; i++) {
    const angle = i * Math.PI * 2 / samples, nextX = rx * Math.cos(angle), nextY = ry * Math.sin(angle);
    lengths[i] = lengths[i - 1] + Math.hypot(nextX - x, nextY - y);
    x = nextX; y = nextY;
  }
  const circumference = lengths[samples];
  return { circumference, phase(degrees: number) {
    const sample = ((degrees % 360 + 360) % 360) / 360 * samples, index = Math.floor(sample);
    return (lengths[index] + (lengths[index + 1] - lengths[index]) * (sample - index)) / circumference;
  } };
}

/** Paint a caption and its halo once per text edit, in either the render worker or main thread. */
export function createObservatoryDisplay(display: Display) {
  const width = 2048, height = 64, pixels = new Uint8Array(width * height * 4);
  const texture = new DataTexture(pixels, width, height, RGBAFormat);
  texture.wrapS = RepeatWrapping; texture.minFilter = texture.magFilter = LinearFilter;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const metrics = observatoryDisplayMetrics(display.radius), start = { value: 0 };
  let previous = '';

  function configure(settings: LandscapeConfig['landmarks']) {
    start.value = metrics.phase(settings.observatoryTextStart);
    const key = JSON.stringify([settings.observatoryText, settings.observatoryTextSize, settings.observatoryTextSpacing]);
    if (key === previous) return;
    previous = key;
    context.resetTransform(); context.clearRect(0, 0, width, height);
    context.scale(width / metrics.circumference, height / display.height);
    context.fillStyle = '#ffffff'; context.textBaseline = 'alphabetic';
    const text = settings.observatoryText, letters = Array.from(text);
    if (letters.length) {
      context.font = 'bold 100px sans-serif';
      const reference = context.measureText(text.trim() || 'M');
      let fontSize = Math.min(settings.observatoryTextSize, display.height * .86) * 100
        / Math.max(1, reference.actualBoundingBoxAscent + reference.actualBoundingBoxDescent);
      context.font = `bold ${fontSize}px sans-serif`;
      let spacing = settings.observatoryTextSpacing;
      const length = letters.reduce((sum, letter) => sum + context.measureText(letter).width, 0) + spacing * (letters.length - 1);
      const fit = Math.min(1, (metrics.circumference - .5) / Math.max(.001, length));
      fontSize *= fit; spacing *= fit;
      context.font = `bold ${fontSize}px sans-serif`;
      const bounds = context.measureText(text.trim() || 'M');
      const baseline = (display.height + bounds.actualBoundingBoxAscent - bounds.actualBoundingBoxDescent) / 2;
      let x = 0;
      for (const letter of letters) {
        context.fillText(letter, x, baseline);
        x += context.measureText(letter).width + spacing;
      }
    }
    const image = context.getImageData(0, 0, width, height).data;
    let halo = new Float32Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      // Canvas starts at the top; the authored UV starts at the bottom of the band.
      const i = y * width + x, value = image[((height - y - 1) * width + x) * 4 + 3];
      pixels[i * 4] = value; pixels[i * 4 + 3] = 255; halo[i] = value;
    }
    // Wrap the horizontal blur so the glow follows captions across the UV seam.
    for (const horizontal of [true, false, true, false]) {
      const blurred = new Float32Array(halo.length), radius = horizontal ? 5 : 3;
      const rows = horizontal ? height : width, columns = horizontal ? width : height;
      const sample = (row: number, column: number) => horizontal
        ? halo[row * width + (column + width) % width]
        : column < 0 || column >= height ? 0 : halo[column * width + row];
      for (let row = 0; row < rows; row++) {
        let sum = 0;
        for (let i = -radius; i <= radius; i++) sum += sample(row, i);
        for (let column = 0; column < columns; column++) {
          blurred[horizontal ? row * width + column : column * width + row] = sum / (radius * 2 + 1);
          sum += sample(row, column + radius + 1) - sample(row, column - radius);
        }
      }
      halo = blurred;
    }
    for (let i = 0; i < halo.length; i++) pixels[i * 4 + 1] = Math.round(halo[i]);
    texture.needsUpdate = true;
  }
  return { texture, start, configure };
}
