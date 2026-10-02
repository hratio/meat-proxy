// This worker is disposable: the search field terminates it on edits or timeout.
self.onmessage = (event: MessageEvent<{ pattern: string; paths: string[] }>) => {
  const { pattern, paths } = event.data;
  const expression = new RegExp(pattern);
  self.postMessage(paths.filter(path => expression.test(path)));
};

export {};
