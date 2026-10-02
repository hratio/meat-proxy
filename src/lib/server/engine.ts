import { ReviewService } from '../review/service';
import { serverPlatform } from './platform';
import { acquireStorage } from '../../../bin/server-ownership.mjs';

type Runtime = { current?: Promise<ReviewService>; retiring: Promise<void> };
const processState = globalThis as typeof globalThis & { __meatProxyService?: Runtime; __meatProxyEngine?: { current?: Promise<{ stop: () => Promise<void> }>; retiring: Promise<void> } };
const runtime = processState.__meatProxyService ||= { retiring: Promise.resolve() };
// Drain the previous implementation too when upgrading a running dev server.
const legacy = processState.__meatProxyEngine;
if (legacy) {
  const previous = legacy.current;
  runtime.retiring = runtime.retiring.then(async () => { await legacy.retiring; if (previous) await (await previous).stop(); });
  delete processState.__meatProxyEngine;
}
const previous = runtime.current;
if (previous) runtime.retiring = runtime.retiring.then(async () => { await (await previous).stop(); }).catch(() => {});
runtime.current = undefined;

export function getService(url?: string) {
  if (!runtime.current) {
    const next = runtime.retiring.then(async () => {
      const { config } = await serverPlatform.loadSettings();
      const repo = await serverPlatform.repository(serverPlatform.root, config);
      acquireStorage(serverPlatform.dataDirectory(repo), process.env.MEAT_PROXY_URL || url || 'http://127.0.0.1:5173');
      const platform = { ...serverPlatform, connection: (dataDir: string) => ({ ...serverPlatform.connection(dataDir), url: process.env.MEAT_PROXY_URL || url || 'http://127.0.0.1:5173' }) };
      return new ReviewService(platform).init();
    }).catch(error => {
      if (runtime.current === next) runtime.current = undefined;
      throw error;
    });
    runtime.current = next;
  }
  return runtime.current;
}

// Development helpers use the preferred review; browser requests address one explicitly.
export const getEngine = async () => (await getService()).get();
