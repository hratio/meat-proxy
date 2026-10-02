import type { ReviewEvents } from '../src/lib/review-client/types';

export const isDemo: boolean = true;
// Each page owns a disposable demo engine; reloading starts from the fixture.
export function setReviewSession(_review: { id: string; createdAt: string; revision: number }) {}
let port: Worker | undefined;
let sequence = 0;
const pending = new Map<number, { resolve: (response: Response) => void; reject: (error: Error) => void }>();
const subscribers = new Set<ReviewEvents>();

function connection() {
  if (port) return port;
  const owner = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'meat-proxy-demo' });
  port = owner;
  const target = port;
  owner.addEventListener('error', () => {
    if (port !== target) return;
    const error = new Error('The demo worker stopped. Reload to start the demo again.');
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    for (const handlers of subscribers) handlers.fault(error.message);
    port = undefined;
  });
  port.addEventListener('message', event => {
    const message = (event as MessageEvent).data;
    if (message.type === 'response' || message.type === 'error') {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.type === 'error') request?.reject(new Error(message.message));
      else request?.resolve(new Response(message.body, { status: message.status, headers: message.headers }));
    } else if (message.type === 'event') {
      for (const handlers of subscribers) {
        if (message.event === 'manifest') {
          if ('fromRevision' in message.value) handlers.update(message.value); else handlers.snapshot(message.value);
        } else if (message.event === 'settings') handlers.settings(message.value);
        else if (message.event === 'fault') handlers.fault(message.value);
        else if (message.event === 'healthy') handlers.healthy();
      }
    }
  });
  window.addEventListener('pagehide', () => { if (port === target) target.postMessage({ type: 'disconnect' }); });
  window.addEventListener('pageshow', event => { if (event.persisted && port === target) target.postMessage({ type: 'subscribe' }); });
  return port;
}

export const reviewFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : undefined;
  const signal = init?.signal || request?.signal;
  if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
  const body = init?.body ? String(init.body) : request?.body ? await request.text() : undefined;
  const id = ++sequence, target = connection();
  const response = new Promise<Response>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    target.postMessage({ type: 'request', id, url: new URL(request?.url || String(input), window.location.origin).href, method: (init?.method || request?.method || 'GET').toUpperCase(), body });
  });
  const cancel = () => { pending.get(id)?.reject(new DOMException('Canceled', 'AbortError')); pending.delete(id); };
  signal?.addEventListener('abort', cancel, { once: true });
  try { return await response; } finally { signal?.removeEventListener('abort', cancel); }
};

export function subscribe(handlers: ReviewEvents): () => void {
  subscribers.add(handlers);
  connection().postMessage({ type: 'subscribe' });
  return () => { subscribers.delete(handlers); };
}
