// Mount nearby files a few at a time. Canceled jobs never parse or highlight.
const pending = new Map<() => void, { batchSize: number; distance: number }>();
let frame = 0;

export function queueDiffRender(render: () => void, batchSize: number, distance = 0) {
  pending.set(render, { batchSize, distance });
  if (!frame) frame = requestAnimationFrame(drain);
  return () => {
    pending.delete(render);
    if (!pending.size) { cancelAnimationFrame(frame); frame = 0; }
  };
}

function drain() {
  frame = 0;
  const batchSize = pending.values().next().value?.batchSize ?? 1;
  // Visible files run before overscan work. IntersectionObserver supplies the
  // distance, so sorting does not force synchronous layout reads.
  const jobs = [...pending.entries()].sort((a, b) => a[1].distance - b[1].distance);
  for (const [render] of jobs.slice(0, batchSize)) {
    pending.delete(render);
    render();
  }
  if (pending.size) frame = requestAnimationFrame(drain);
}
