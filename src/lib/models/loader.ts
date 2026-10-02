import { assetUrl } from '../asset-url';
import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import decoderScript from 'three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url';
import decoderWasm from 'three/addons/libs/draco/gltf/draco_decoder.wasm?url';

let decoder: DRACOLoader | undefined;

/** Shared decoder worker pool using bundled Draco files. */
export function createModelLoader() {
  // Resolve assets directly through Vite, independent of the loader module's
  // location after dependency optimization or rendering-worker transforms.
  decoder ??= new DRACOLoader().setDecoderPath({ js: decoderScript, wasm: decoderWasm }).setWorkerLimit(2);
  return new GLTFLoader(new LoadingManager().setURLModifier(assetUrl)).setDRACOLoader(decoder);
}

if (import.meta.hot) import.meta.hot.dispose(() => decoder?.dispose());
