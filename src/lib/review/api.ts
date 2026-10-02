import { z } from 'zod';
import { catalogActionSchema } from '$lib/catalog-actions';
import { configSchema } from '$lib/config';
import { migrateFileFilterSettings } from '$lib/file-filter-presets';
import { agentFeedbackSchema } from '$lib/comment-threads';
import { actionSchema, comparisonSchema } from '$lib/action-schema';
import type { Action, SnapshotMessage } from '$lib/types';
import type { ReviewEngine } from './engine';
import type { ReviewPlatform } from './platform';
import type { ReviewService } from './service';

const json = Response.json;

type Context = { params: { endpoint: string }; url: URL; request: Request; engine: ReviewEngine; service?: ReviewService; commitPage: ReviewPlatform['commitPage'] };

const selectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('live'), worktree: z.string() }),
  z.object({ mode: z.literal('compare'), worktree: z.string(), sourceRef: z.string().min(1).max(500), targetRef: z.string().min(1).max(500), sourceBranch: z.string().max(500).optional(), targetBranch: z.string().max(500).optional() })
]);
export const failure = (error: unknown) => json({ error: error instanceof z.ZodError ? error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n') : error instanceof Error ? error.message : String(error) }, { status: 400 });

export const readReview = async ({ params, url, request, engine, commitPage }: Context) => {
  try {
    if (params.endpoint === 'bootstrap') { const data = engine.bootstrap(); return json(url.searchParams.has('manifest') ? { ...data, snapshot: engine.manifest(data.snapshot) } : data); }
    if (params.endpoint === 'repo') return json(await engine.refreshRepo(url.searchParams.get('worktree') || undefined));
    if (params.endpoint === 'commits') return json(await commitPage(
      z.string().min(1).parse(url.searchParams.get('worktree')),
      z.string().min(1).max(500).parse(url.searchParams.get('branch')),
      z.string().min(1).max(500).optional().parse(url.searchParams.get('before') || undefined),
      z.coerce.number().int().min(0).parse(url.searchParams.get('offset') || 0), engine.repo, engine.config
    ));
    if (params.endpoint === 'snapshot') return json(url.searchParams.has('manifest') ? engine.manifest() : engine.snapshot());
    if (params.endpoint === 'file-patch') return json(await engine.filePatch(
      z.string().min(1).parse(url.searchParams.get('reviewId')),
      z.string().min(1).max(4096).parse(url.searchParams.get('path')),
      z.string().regex(/^[a-f0-9]{64}$/).parse(url.searchParams.get('key'))
    ));
    if (params.endpoint === 'file-contents') return json(await engine.fileContents(
      z.string().min(1).parse(url.searchParams.get('reviewId')),
      z.string().min(1).max(4096).parse(url.searchParams.get('path')),
      comparisonSchema.parse({ base: url.searchParams.get('base'), head: url.searchParams.get('head') })
    ));
    if (params.endpoint === 'file') return json(await engine.fileView(
      z.string().min(1).parse(url.searchParams.get('reviewId')),
      z.string().min(1).parse(url.searchParams.get('path')),
      z.enum(['latest', 'head', 'history']).parse(url.searchParams.get('kind') || 'latest'),
      url.searchParams.get('round') || undefined,
      url.searchParams.get('finding') || undefined
    ));
    if (params.endpoint === 'export') {
      const format = url.searchParams.get('format') === 'markdown' ? 'markdown' : 'json';
      const options = { includeCatalog: url.searchParams.get('catalog') !== 'false', includeExamples: url.searchParams.get('examples') !== 'false', includeResolved: url.searchParams.get('resolved') === 'true' };
      const exported = engine.exportReview(format, options);
      return new Response(typeof exported === 'string' ? exported : JSON.stringify(exported, null, 2), { headers: { 'Content-Type': format === 'json' ? 'application/json' : 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="review-${engine.review.id}.${format === 'json' ? 'json' : 'md'}"` } });
    }
    if (params.endpoint === 'events') {
      const event = url.searchParams.has('manifest') ? 'manifest' : 'snapshot';
      let cleanup = () => {};
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          let closed = false;
          const send = (name: string, data: unknown) => { if (!closed) controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)); };
          const snapshot = (data: SnapshotMessage) => send('fromRevision' in data ? 'update' : 'snapshot', data);
          const fault = (message: string) => send('fault', { message });
          const settings = (data: unknown) => send('settings', data);
          const healthy = () => send('healthy', {});
          const shutdown = () => { if (!closed) { controller.close(); cleanup(); } };
          engine.events.on(event, snapshot).on('fault', fault).on('settings', settings).on('healthy', healthy).on('shutdown', shutdown);
          const heartbeat = setInterval(() => send('heartbeat', {}), engine.config.server.heartbeatMs);
          cleanup = () => {
            if (closed) return;
            closed = true; clearInterval(heartbeat);
            engine.events.off(event, snapshot).off('fault', fault).off('settings', settings).off('healthy', healthy).off('shutdown', shutdown);
            request.signal.removeEventListener('abort', cleanup);
          };
          request.signal.addEventListener('abort', cleanup);
          send('snapshot', event === 'manifest' ? engine.manifest() : engine.snapshot());
        },
        cancel() { cleanup(); }
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
    }
    return json({ error: 'Unknown endpoint.' }, { status: 404 });
  } catch (error) { return failure(error); }
};

export const writeReview = async ({ params, request, url, engine, service }: Context) => {
  try {
    const body = await request.json();
    const expected = {
      generation: z.string().datetime().optional().parse(request.headers.get('X-Review-Generation') || undefined),
      revision: request.headers.has('X-Review-Revision') ? z.coerce.number().int().min(0).parse(request.headers.get('X-Review-Revision')) : undefined
    };
    switch (params.endpoint) {
      case 'action': return json(await engine.action(actionSchema.parse(body.action) as Action, z.string().parse(body.reviewId), url.searchParams.has('manifest'), expected));
      case 'select': {
        const selection = selectionSchema.parse(body.selection), decision = z.enum(['save', 'discard']).optional().parse(body.decision), reset = z.boolean().optional().parse(body.reset);
        if (service) {
          const destination = await service.select(engine, selection, decision, reset, expected);
          return json(url.searchParams.has('manifest') ? destination.manifest() : destination.snapshot());
        }
        const snapshot = await engine.select(selection, decision, reset, expected);
        return json(url.searchParams.has('manifest') ? engine.manifest(snapshot) : snapshot);
      }
      case 'update-head': {
        const snapshot = await engine.updateToHead(z.string().parse(body.reviewId), expected);
        return json(url.searchParams.has('manifest') ? engine.manifest(snapshot) : snapshot);
      }
      case 'config': return json(await (service ? service.settings(engine, () => engine.updateConfig(configSchema.parse(migrateFileFilterSettings(body)))) : engine.updateConfig(configSchema.parse(migrateFileFilterSettings(body)))));
      case 'catalog': return json(await (service ? service.settings(engine, () => engine.importCatalog(body)) : engine.importCatalog(body)));
      case 'catalog-action': return json(await (service ? service.settings(engine, () => engine.editCatalog(catalogActionSchema.parse(body))) : engine.editCatalog(catalogActionSchema.parse(body))));
      case 'dispatch': return json(await engine.dispatch(z.string().parse(body.reviewId), expected));
      case 'agent': {
        return json(await (service ? service.agentFeedback(agentFeedbackSchema.parse(body)) : engine.agentFeedback(agentFeedbackSchema.parse(body))));
      }
      default: return json({ error: 'Unknown endpoint.' }, { status: 404 });
    }
  } catch (error) { return failure(error); }
};
