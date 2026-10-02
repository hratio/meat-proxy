import { failure, readReview, writeReview } from '../src/lib/review/api';
import { createBrowserSession } from './platform';
import { BrowserFiles } from './filesystem';
import { runBrowserAgent } from './agent';

type Port = { postMessage: (message: unknown) => void; addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void; start?: () => void };
const ports = new Set<Port>();
const session = createBrowserSession(new BrowserFiles());
const runningJobs = new Map<string, Promise<unknown>>();
let commands = Promise.resolve();

void session.then(({ engine }) => {
  for (const event of ['manifest', 'settings', 'fault', 'healthy'] as const) engine.events.on(event, value => {
    for (const port of ports) port.postMessage({ type: 'event', event, value });
  });
}).catch(error => { for (const port of ports) port.postMessage({ type: 'event', event: 'fault', value: String(error) }); });

async function handle(message: { url: string; method: string; body?: string }) {
  const current = await session;
  const url = new URL(message.url), endpoint = url.pathname.replace(/^\/api\//, '');
  if (endpoint === 'demo-agent') {
    const { reviewId, dispatchId, commit } = JSON.parse(message.body || '{}');
    let job = runningJobs.get(dispatchId);
    if (!job) {
      job = runBrowserAgent(current, dispatchId, reviewId, commit === true);
      runningJobs.set(dispatchId, job);
      void job.finally(() => runningJobs.delete(dispatchId)).catch(() => {});
    }
    return Response.json(await job);
  }
  const request = new Request(url, { method: message.method, ...(message.method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: message.body }) });
  const context = { params: { endpoint }, url, request, engine: current.engine, commitPage: current.platform.commitPage };
  return message.method === 'GET' ? readReview(context) : writeReview(context);
}

function connect(port: Port) {
  ports.add(port); port.start?.();
  port.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'disconnect') { ports.delete(port); return; }
    ports.add(port);
    if (message.type === 'subscribe') {
      void session.then(({ engine }) => {
        port.postMessage({ type: 'event', event: 'manifest', value: engine.manifest() });
        port.postMessage({ type: 'event', event: 'settings', value: { config: engine.config, catalog: engine.catalog } });
        port.postMessage({ type: 'event', event: 'healthy' });
      }).catch(error => port.postMessage({ type: 'event', event: 'fault', value: String(error) }));
      return;
    }
    // Serialize edits and requests within this page's demo.
    commands = commands.then(async () => {
      let response: Response;
      try { response = await handle(message); } catch (error) { response = failure(error); }
      const headers = Object.fromEntries(response.headers);
      port.postMessage({ type: 'response', id: message.id, status: response.status, headers, body: await response.text() });
    }).catch(error => port.postMessage({ type: 'error', id: message.id, message: String(error) }));
  });
}

connect(self as unknown as Port);
