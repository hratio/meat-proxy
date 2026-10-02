import { matchingPresetPaths, type FileFilterPreset } from '../file-filter-presets';

self.onmessage = (event: MessageEvent<{ paths: string[]; presets: FileFilterPreset[] }>) => {
  self.postMessage(matchingPresetPaths(event.data.paths, event.data.presets));
};

export {};
