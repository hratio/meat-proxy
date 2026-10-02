import { replaceState } from '$app/navigation';
import type { ReviewEvents } from './types';
import type { Review } from '../types';

export const isDemo: boolean = false;
let session: Pick<Review, 'id' | 'createdAt' | 'revision'> | undefined;
const subscriptions = new Set<() => void>();
const selectedId = () => session?.id || (typeof window === 'undefined' ? undefined : new URL(location.href).searchParams.get('review') || undefined);

export function setReviewSession(review: Pick<Review, 'id' | 'createdAt' | 'revision'>) {
  const changed = selectedId() !== review.id;
  session = { id: review.id, createdAt: review.createdAt, revision: review.revision };
  const url = new URL(location.href);
  if (url.searchParams.get('review') !== review.id || url.searchParams.has('worktree')) {
    url.searchParams.set('review', review.id); url.searchParams.delete('worktree');
    replaceState(url, {});
  }
  if (changed) for (const reconnect of subscriptions) reconnect();
}

export const reviewFetch: typeof fetch = async (input, init) => {
  const original = input instanceof Request ? input : undefined;
  const url = new URL(original?.url || String(input), location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return fetch(input, init);
  const id = selectedId();
  if (id && !url.searchParams.has('reviewId')) url.searchParams.set('reviewId', id);
  if (!id && !url.searchParams.has('worktree')) {
    const worktree = new URL(location.href).searchParams.get('worktree');
    if (worktree) url.searchParams.set('worktree', worktree);
  }
  const method = (init?.method || original?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers || original?.headers);
  if (method === 'POST' && session) {
    headers.set('X-Review-Id', session.id);
    headers.set('X-Review-Generation', session.createdAt);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    if (['select', 'update-head'].includes(url.pathname.split('/').at(-1)!) || ['undo', 'redo', 'discard', 'save', 'finish'].includes(body?.action?.type)) headers.set('X-Review-Revision', String(session.revision));
  }
  const response = await fetch(original ? new Request(url, original) : url, { ...init, headers });
  if (id && selectedId() !== id && !url.pathname.endsWith('/select')) throw new DOMException('The tab selected another review.', 'AbortError');
  return response;
};

export function subscribe(handlers: ReviewEvents): () => void {
  let events: EventSource | undefined;
  const connect = () => {
    events?.close();
    const url = new URL('/api/events?manifest=1', location.origin);
    const id = selectedId();
    if (id) url.searchParams.set('reviewId', id);
    const source = events = new EventSource(url);
    const active = () => events === source && selectedId() === id;
    source.onerror = () => { if (active()) handlers.disconnected(); };
    source.addEventListener('snapshot', event => { if (active()) handlers.snapshot(JSON.parse(event.data)); });
    source.addEventListener('update', event => { if (active()) handlers.update(JSON.parse(event.data)); });
    source.addEventListener('settings', event => { if (active()) handlers.settings(JSON.parse(event.data)); });
    source.addEventListener('fault', event => { if (active()) handlers.fault(JSON.parse(event.data).message); });
    source.addEventListener('healthy', () => { if (active()) handlers.healthy(); });
  };
  subscriptions.add(connect); connect();
  return () => { subscriptions.delete(connect); events?.close(); events = undefined; };
}
