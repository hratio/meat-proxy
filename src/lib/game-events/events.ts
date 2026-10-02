import type { Snapshot } from '../types';
import type { GameEvent } from './schema';

export function reviewSession(snapshot?: Snapshot) {
  return snapshot ? `${snapshot.review.id}:${snapshot.review.createdAt}` : '';
}
const complete = (snapshot: Snapshot) => !snapshot.warning && snapshot.files.length > 0
  && snapshot.files.every(file => snapshot.review.reviewed[file.path] === file.revision);

// Only confirmed transitions count. Initial load, duplicate SSE acknowledgements,
// undo/reopen, and switching reviews cannot replay a completion reaction.
export function completionEvents(previous: Snapshot | undefined, next: Snapshot): GameEvent[] {
  if (!previous || reviewSession(previous) !== reviewSession(next)) return [];
  const paths = new Set(previous.files.map(file => file.path));
  const events: GameEvent[] = next.files
    .filter(file => paths.has(file.path) && next.review.reviewed[file.path] === file.revision && previous.review.reviewed[file.path] !== file.revision)
    .map(() => ({ type: 'file-complete' }));
  if (events.length && complete(next) && !complete(previous)) events.push({ type: 'review-complete' });
  return events;
}
