import type { FromRenderer, RenderInput, RendererKind, ToRenderer } from './protocol';
import type { RenderEngine, RenderSize } from './surface';

type Client = { event: (value: unknown) => void; fail: () => void };
type Connection = {
  worker: Worker; clients: Map<number, Client>; ready: Promise<boolean>;
  users: number; close: () => void;
};
let connection: Connection | undefined, workerDisabled = false, nextId = 0;

function rendererWorker(): Connection | undefined {
  if (workerDisabled) return;
  if (connection) return connection;
  let worker: Worker;
  try { worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module', name: 'meat-proxy-rendering' }); }
  catch { workerDisabled = true; return; }
  let resolve!: (supported: boolean) => void, closed = false;
  const ready = new Promise<boolean>(done => { resolve = done; });
  const clients = new Map<number, Client>();
  const close = () => {
    if (closed) return;
    closed = true; worker.terminate(); resolve(false);
    if (connection === link) connection = undefined;
  };
  const fail = () => {
    if (closed) return;
    workerDisabled = true; close();
    for (const client of [...clients.values()]) client.fail();
    clients.clear();
  };
  // Pending worker downloads are not capability failures, regardless of speed.
  const link: Connection = { worker, clients, ready, users: 0, close };
  worker.addEventListener('error', event => { event.preventDefault(); fail(); });
  worker.addEventListener('messageerror', fail);
  worker.addEventListener('message', ({ data }: MessageEvent<FromRenderer>) => {
    if (closed) return;
    if (data.type === 'capability') {
      if (!data.supported) { fail(); return; }
      resolve(true);
    } else if (data.type === 'event') clients.get(data.id)?.event(data.event);
    else if (data.type === 'fault') clients.get(data.id)?.fail();
  });
  return connection = link;
}

/** One rendering worker per page. Only plain state crosses the boundary. */
export function createRenderHost<State extends object, RendererEvent>(options: {
  kind: RendererKind; canvas: HTMLCanvasElement; state: State; size: RenderSize;
  forceMain?: boolean; event: (event: RendererEvent) => void;
  /** A transferred canvas cannot be reused. Its owner replaces the keyed element. */
  fallback: () => void;
  failure: (error: unknown) => void;
}) {
  const id = ++nextId, state = { ...options.state };
  let size = options.size, disposed = false, transferred = false;
  let lease: Connection | undefined, link: Connection | undefined, engine: RenderEngine<State> | undefined;
  let pending: Partial<State> = {}, frame = 0;
  const inputs: RenderInput[] = [];
  const send = (message: ToRenderer, transfer: Transferable[] = []) => link?.worker.postMessage(message, transfer);
  const emit = (event: RendererEvent) => { if (!disposed) options.event(event); };
  const flush = () => {
    frame = 0;
    if (disposed || !Object.keys(pending).length) return;
    const patch = pending; pending = {};
    if (link) send({ type: 'update', id, patch }); else engine?.update(patch);
  };
  const fault = () => {
    if (disposed) return;
    if (transferred) { dispose(); options.fallback(); }
  };
  const contextLost = (event: Event) => {
    if (disposed) return;
    event.preventDefault(); dispose(); options.fallback();
  };
  if (options.kind !== 'landscape') options.canvas.addEventListener('webglcontextlost', contextLost);
  async function start() {
    try {
      const supported = !options.forceMain && typeof options.canvas.transferControlToOffscreen === 'function' && typeof Worker !== 'undefined';
      // Retain the connection before awaiting the capability probe. A component
      // may unmount here, or another surface may mount while the last one exits.
      lease = supported ? rendererWorker() : undefined;
      if (lease) lease.users++;
      const candidate = lease && await lease.ready ? lease : undefined;
      if (disposed) return;
      if (candidate) {
        let canvas: OffscreenCanvas;
        try { canvas = options.canvas.transferControlToOffscreen(); }
        catch { await fallback(); return; }
        transferred = true; link = candidate;
        link.clients.set(id, { event: event => emit(event as RendererEvent), fail: fault });
        options.canvas.dataset.renderer = 'worker';
        send({ type: 'init', id, kind: options.kind, canvas, state, size, timeOrigin: performance.timeOrigin }, [canvas]);
        pending = {};
        for (const event of inputs) send({ type: 'input', id, event });
        inputs.length = 0;
      } else await fallback();
    } catch (error) {
      if (transferred) fault(); else if (!disposed) options.failure(error);
    }
  }
  async function fallback() {
    const { createRenderer } = await import('./factory');
    if (disposed) return;
    options.canvas.dataset.renderer = 'main';
    const created = await createRenderer(options.kind, { canvas: options.canvas, state, size, timeOrigin: performance.timeOrigin, emit, current: () => !disposed });
    if (disposed) { created.dispose(); return; }
    engine = created;
    engine.update(state); engine.resize(size); pending = {};
    for (const event of inputs) engine.input?.(event);
    inputs.length = 0;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame); inputs.length = 0;
    options.canvas.removeEventListener('webglcontextlost', contextLost);
    engine?.dispose();
    if (link) {
      send({ type: 'dispose', id }); link.clients.delete(id);
    }
    if (lease && --lease.users === 0) lease.close();
    link = lease = undefined;
  }
  void start();
  return {
    update(patch: Partial<State>) {
      if (disposed) return;
      Object.assign(state, patch); Object.assign(pending, patch);
      // External clocks already advance on window RAF. Queuing another RAF here
      // can deliver only alternating frames after Svelte flushes its effects.
      // Visibility must also reach the worker while window RAF is suspended.
      if ('hidden' in patch || ('time' in patch && typeof patch.time === 'number')) {
        cancelAnimationFrame(frame); flush(); return;
      }
      if (!frame) frame = requestAnimationFrame(flush);
    },
    resize(next: RenderSize) { size = next; if (disposed) return; if (link) send({ type: 'resize', id, size }); else engine?.resize(size); },
    input(event: RenderInput) { if (disposed) return; if (link) send({ type: 'input', id, event }); else if (engine) engine.input?.(event); else inputs.push(event); },
    dispose
  };
}
