import { untrack } from 'svelte';

const debounceMs = 200;

export function createFileSearch(inputPaths: () => string[], beforeChange: (paths?: ReadonlySet<string>) => (() => void) | undefined) {
  let query = $state('');
  let regex = $state(false);
  let submitted = $state(0);
  let applied = $state<{ query: string; regex: boolean; paths?: ReadonlySet<string> }>({ query: '', regex: false });
  let settled = $state<{ key: string; error?: string }>();
  // Metadata-only updates must not restart the debounce or worker.
  const key = $derived(JSON.stringify({ query: regex ? query : query.trim(), regex, paths: inputPaths(), submitted }));
  const value = $derived<{ query: string; regex: boolean; paths: string[] }>(JSON.parse(key));
  const syntaxError = $derived.by(() => {
    if (!regex || !query) return '';
    try { new RegExp(query); return ''; }
    catch (error) { return error instanceof Error ? error.message : 'Invalid regular expression'; }
  });
  let previousSubmit = 0;

  $effect(() => {
    const request = value;
    const requestKey = key;
    const immediate = submitted !== previousSubmit;
    previousSubmit = submitted;
    if (syntaxError) return;
    const apply = (paths?: ReadonlySet<string>) => {
      const restore = beforeChange(paths);
      applied = { query: request.query, regex: request.regex, paths };
      settled = { key: requestKey };
      restore?.();
    };
    // Clearing the filter (including Escape) restores the file list immediately.
    if (!request.query) { untrack(() => apply()); return; }
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let canceled = false;
    const debounce = setTimeout(() => {
      if (!request.regex) {
        // Match Trees' ordinary case-insensitive full-path substring search.
        const pattern = request.query.replaceAll('\\', '/').toLowerCase();
        apply(new Set(request.paths.filter(path => path.toLowerCase().includes(pattern))));
        return;
      }
      worker = new Worker(new URL('./file-regex.worker.ts', import.meta.url), { type: 'module' });
      const fail = (error: string) => {
        worker?.terminate();
        if (!canceled) settled = { key: requestKey, error };
      };
      timeout = setTimeout(() => fail('Expression took too long. Try a more specific pattern.'), 3000);
      worker.onmessage = (event: MessageEvent<string[]>) => {
        clearTimeout(timeout);
        worker?.terminate();
        if (!canceled) apply(new Set(event.data));
      };
      worker.onerror = event => {
        event.preventDefault();
        clearTimeout(timeout);
        fail('Could not filter files. Edit the expression to try again.');
      };
      worker.postMessage({ pattern: request.query, paths: request.paths });
    }, immediate ? 0 : debounceMs);
    return () => { canceled = true; clearTimeout(debounce); clearTimeout(timeout); worker?.terminate(); };
  });

  return {
    get query() { return query; },
    set query(value: string) { query = value; },
    get regex() { return regex; },
    set regex(value: boolean) { regex = value; },
    get paths() { return applied.paths; },
    get appliedQuery() { return applied.query; },
    get appliedRegex() { return applied.regex; },
    get active() { return !!applied.query; },
    get syntaxError() { return syntaxError; },
    get error() { return syntaxError || (settled?.key === key ? settled.error : '') || ''; },
    get pending() { return !!value.query && !syntaxError && settled?.key !== key; },
    submit() { submitted++; }
  };
}

export type FileSearch = ReturnType<typeof createFileSearch>;
