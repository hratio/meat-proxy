import { gradePixels, neutral } from '../tooling/splash/color-workshop/grade.mjs';
import type { Splash2ColorGrade, Splash2LayerName } from '$lib/components/splash/splash2-playback-config';

export interface ColorPreviewRequest {
  id: number;
  layers: Record<Splash2LayerName, { source: string; grade: Splash2ColorGrade }>;
}
export interface ColorPreviewResult {
  id: number;
  layers?: Record<Splash2LayerName, { source: string; blob?: Blob }>;
  error?: string;
}
const pixels = new Map<string, Promise<ImageData>>();
const outputs = new Map<string, { key: string; blob: Blob }>();
let latest = 0;

function load(source: string) {
  let pending = pixels.get(source);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(source);
      if (!response.ok) throw new Error('A source image could not be loaded.');
      const image = await createImageBitmap(await response.blob());
      try {
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height);
      } finally { image.close(); }
    })();
    pixels.set(source, pending);
    pending.catch(() => pixels.delete(source));
  }
  return pending;
}

self.onmessage = async ({ data: request }: MessageEvent<ColorPreviewRequest>) => {
  latest = request.id;
  const layers = {} as NonNullable<ColorPreviewResult['layers']>;
  try {
    for (const [name, { source, grade }] of Object.entries(request.layers)) {
      if (request.id !== latest) return;
      if (Object.entries(neutral).every(([key, value]) => grade[key as keyof Splash2ColorGrade] === value)) {
        layers[name as Splash2LayerName] = { source }; continue;
      }
      const key = JSON.stringify(grade);
      let cached = outputs.get(source);
      if (cached?.key !== key) {
        const original = await load(source);
        if (request.id !== latest) return;
        const copy = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
        gradePixels(copy.data, grade);
        const canvas = new OffscreenCanvas(copy.width, copy.height);
        canvas.getContext('2d')!.putImageData(copy, 0, 0);
        cached = { key, blob: await canvas.convertToBlob({ type: 'image/png' }) };
        outputs.set(source, cached);
      }
      layers[name as Splash2LayerName] = { source, blob: cached.blob };
    }
    if (request.id === latest) self.postMessage({ id: request.id, layers } satisfies ColorPreviewResult);
  } catch (error) {
    if (request.id === latest) self.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) } satisfies ColorPreviewResult);
  }
};
