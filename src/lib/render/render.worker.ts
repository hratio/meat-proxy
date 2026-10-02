/// <reference lib="webworker" />
import { createRenderer } from './factory';
import type { RenderEngine, RenderSize } from './surface';
import type { FromRenderer, ToRenderer } from './protocol';

const send = (message: FromRenderer) => self.postMessage(message);
const views = new Map<number, { engine?: RenderEngine<any>; state: object; size: RenderSize; inputs: Extract<ToRenderer, { type: 'input' }>['event'][]; detach: () => void }>();

try {
  const canvas = new OffscreenCanvas(1, 1), context = canvas.getContext('webgl2');
  send({ type: 'capability', supported: !!context });
  context?.getExtension('WEBGL_lose_context')?.loseContext();
} catch { send({ type: 'capability', supported: false }); }

self.onmessage = ({ data }: MessageEvent<ToRenderer>) => {
  if (data.type === 'init') {
    const view: NonNullable<ReturnType<typeof views.get>> = { state: data.state, size: data.size, inputs: [], detach() {} };
    views.set(data.id, view);
    const lost = (event: Event) => {
      if (views.get(data.id) !== view) return;
      event.preventDefault(); send({ type: 'fault', id: data.id, message: 'Rendering context lost' });
    };
    if (data.kind !== 'landscape') data.canvas.addEventListener('webglcontextlost', lost);
    view.detach = () => data.canvas.removeEventListener('webglcontextlost', lost);
    void createRenderer(data.kind, { ...data, current: () => views.get(data.id) === view, emit: event => {
      if (views.get(data.id) === view) send({ type: 'event', id: data.id, event });
    } }).then(engine => {
      if (views.get(data.id) !== view) { engine.dispose(); return; }
      view.engine = engine;
      engine.update(view.state); engine.resize(view.size);
      for (const event of view.inputs) engine.input?.(event);
      view.inputs.length = 0;
    }).catch(error => {
      if (views.get(data.id) === view) send({ type: 'fault', id: data.id, message: String(error) });
    });
    return;
  }
  const view = views.get(data.id);
  if (!view) return;
  try {
    switch (data.type) {
      case 'update': Object.assign(view.state, data.patch); view.engine?.update(data.patch); break;
      case 'resize': view.size = data.size; view.engine?.resize(data.size); break;
      case 'input': if (view.engine) view.engine.input?.(data.event); else view.inputs.push(data.event); break;
      case 'dispose': views.delete(data.id); view.detach(); view.engine?.dispose(); break;
    }
  } catch (error) { send({ type: 'fault', id: data.id, message: String(error) }); }
};
