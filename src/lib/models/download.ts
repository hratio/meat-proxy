import { assetUrl } from '../asset-url.ts';
/** Embed external textures while retaining compressed geometry. */
export async function standaloneModel(url: string, signal?: AbortSignal): Promise<Blob> {
  const modelURL = new URL(assetUrl(url), window.location.href);
  const get = async (resource: URL) => {
    const response = await fetch(resource, { signal });
    if (!response.ok) throw new Error('Model download failed. Please try again.');
    return new Uint8Array(await response.arrayBuffer());
  };
  const source = await get(modelURL);
  const sourceView = new DataView(source.buffer);
  if (sourceView.getUint32(0, true) !== 0x46546c67 || sourceView.getUint32(4, true) !== 2) throw new Error('Invalid model file.');
  const jsonLength = sourceView.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(source.subarray(20, 20 + jsonLength)));
  if (json.buffers.length !== 1 || json.buffers[0].uri) throw new Error('Unsupported model download.');
  const binaryLength = sourceView.getUint32(20 + jsonLength, true);
  const chunks: Uint8Array<ArrayBuffer>[] = [source.slice(28 + jsonLength, 28 + jsonLength + binaryLength)];
  let offset = binaryLength;
  const images: { uri?: string; bufferView?: number }[] = json.images ?? [];
  const data = await Promise.all(images.map(image => image.uri ? get(new URL(image.uri, modelURL)) : undefined));
  for (const [i, image] of images.entries()) {
    const bytes = data[i];
    if (!bytes) continue;
    image.bufferView = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    delete image.uri;
    chunks.push(bytes);
    const padding = new Uint8Array((4 - bytes.length % 4) % 4);
    chunks.push(padding);
    offset += bytes.length + padding.length;
  }
  json.buffers[0].byteLength = offset;
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padding = new Uint8Array((4 - text.length % 4) % 4).fill(32);
  const header = new Uint8Array(20), headerView = new DataView(header.buffer);
  headerView.setUint32(0, 0x46546c67, true);
  headerView.setUint32(4, 2, true);
  headerView.setUint32(8, 28 + text.length + padding.length + offset, true);
  headerView.setUint32(12, text.length + padding.length, true);
  headerView.setUint32(16, 0x4e4f534a, true);
  const binHeader = new Uint8Array(8), binView = new DataView(binHeader.buffer);
  binView.setUint32(0, offset, true);
  binView.setUint32(4, 0x004e4942, true);
  return new Blob([header, text, padding, binHeader, ...chunks], { type: 'model/gltf-binary' });
}
