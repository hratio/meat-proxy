import { getService } from '$lib/server/engine';
import { commitPage } from '$lib/server/git';
import { openReviewFile } from '$lib/server/editor';
import { readReview, writeReview, failure } from '$lib/review/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, request }) => {
  try {
    const service = await getService(url.origin);
    if (params.endpoint === 'server') return Response.json({ repository: service.repo.commonDir, dataDir: service.dataDir, pid: process.pid });
    const engine = await service.get(url.searchParams.get('reviewId') || undefined, url.searchParams.get('worktree') || undefined);
    return await readReview({ params, url, request, engine, service, commitPage });
  } catch (error) { return failure(error); }
};
export const POST: RequestHandler = async ({ params, url, request }) => {
  try {
    const service = await getService(url.origin);
    const body = await request.clone().json();
    const addressed = url.searchParams.get('reviewId') || request.headers.get('X-Review-Id');
    if (addressed && body.reviewId && addressed !== body.reviewId) throw new Error('The request addresses two different reviews.');
    const engine = await service.get(addressed || body.reviewId || undefined);
    if (params.endpoint === 'open-editor') return Response.json(await openReviewFile(engine, body));
    return await writeReview({ params, url, request, engine, service, commitPage });
  } catch (error) { return failure(error); }
};
