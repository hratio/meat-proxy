import { json } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { readShellAppearance } from '$lib/server/settings';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(event.url.hostname)) return json({ error: 'Local connections only.' }, { status: 403 });
    const origin = event.request.headers.get('origin');
    const token = process.env.MEAT_PROXY_TOKEN;
    const authorized = token && event.request.headers.get('authorization') === `Bearer ${token}`;
    if (origin && origin !== event.url.origin && !authorized) return json({ error: 'Origin rejected.' }, { status: 403 });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) && origin !== event.url.origin && !authorized) return json({ error: 'Use a same-origin request or the local agent token.' }, { status: 403 });
  }
  const response = await resolve(event, {
    transformPageChunk: async ({ html }) => {
      if (!html.includes('data-theme="bunker"')) return html;
      const { theme, style } = await readShellAppearance();
      return html.replace('data-theme="bunker"', `data-theme="${theme}"${style ? ` style="${style}"` : ''}`);
    }
  });
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  // The HTML names this build's hashed assets. Reusing it after a local rebuild
  // can reference files that no longer exist; hashed assets keep their own cache.
  if (event.url.pathname.startsWith('/api/') || response.headers.get('content-type')?.includes('text/html')) response.headers.set('Cache-Control', 'no-store');
  return response;
};
