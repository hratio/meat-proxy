// Preserve input order and drain in-flight work before propagating an error.
// A failed serialized engine operation must not leave workers mutating its review.
export async function mapLimit<T, R>(items: readonly T[], limit: number, visit: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length);
  let next = 0, failed = false, failure: unknown;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed) {
      const index = next++;
      if (index >= items.length) return;
      try { result[index] = await visit(items[index], index); }
      catch (error) { failed = true; failure = error; }
    }
  }));
  if (failed) throw failure;
  return result;
}
