// One observer per scroll root/margin, rather than one per placeholder.
const roots = new WeakMap<HTMLElement, Map<number, { observer: IntersectionObserver; callbacks: Map<Element, (entry: IntersectionObserverEntry) => void> }>>();

export function observeFile(element: HTMLElement, root: HTMLElement, margin: number, callback: (entry: IntersectionObserverEntry) => void) {
  let margins = roots.get(root);
  if (!margins) roots.set(root, margins = new Map());
  let group = margins.get(margin);
  if (!group) {
    const callbacks = new Map<Element, (entry: IntersectionObserverEntry) => void>();
    group = { callbacks, observer: new IntersectionObserver(entries => {
      for (const entry of entries) callbacks.get(entry.target)?.(entry);
    }, { root, rootMargin: `${margin}px 0px` }) };
    margins.set(margin, group);
  }
  group.callbacks.set(element, callback);
  group.observer.observe(element);
  return () => {
    group.observer.unobserve(element);
    group.callbacks.delete(element);
    if (!group.callbacks.size) { group.observer.disconnect(); margins.delete(margin); }
  };
}
