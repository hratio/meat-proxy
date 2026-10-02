import { matchingPresetPaths, type FileFilterPreset } from '../file-filter-presets';

export function createPresetMatches(input: () => { paths: string[]; presets: FileFilterPreset[] }) {
  // A content key avoids restarting a search when only review metadata changes.
  const key = $derived(JSON.stringify(input()));
  const value = $derived<{ paths: string[]; presets: FileFilterPreset[] }>(JSON.parse(key));
  const regex = $derived(value.presets.some(preset => preset.include.regex || preset.exclude.regex));
  const literalPaths = $derived(regex ? undefined : new Set(matchingPresetPaths(value.paths, value.presets)));
  let result = $state<{ key: string; paths: Set<string>; error?: string }>();
  const empty = new Set<string>();

  $effect(() => {
    if (!regex) return;
    const request = key;
    const worker = new Worker(new URL('./file-presets.worker.ts', import.meta.url), { type: 'module' });
    const fail = (error: string) => {
      worker.terminate();
      result = { key: request, paths: empty, error };
    };
    const timeout = setTimeout(() => fail('A filter expression took too long. Edit the preset or deselect it to continue.'), 3000);
    worker.onmessage = (event: MessageEvent<string[]>) => {
      clearTimeout(timeout);
      result = { key: request, paths: new Set(event.data) };
      worker.terminate();
    };
    worker.onerror = event => {
      event.preventDefault();
      clearTimeout(timeout);
      fail('Could not apply the filter presets. Edit a preset or deselect it to continue.');
    };
    worker.postMessage(value);
    return () => { clearTimeout(timeout); worker.terminate(); };
  });

  return {
    get paths() { return !value.presets.length ? undefined : regex ? result?.key === key ? result.paths : empty : literalPaths; },
    get pending() { return regex && result?.key !== key; },
    get error() { return regex && result?.key === key ? result.error : undefined; }
  };
}
