import { afterEach, expect, test, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';
import { handle } from './hooks.server';

afterEach(() => vi.unstubAllEnvs());

async function request(url: string, method = 'GET', headers: Record<string, string> = {}) {
  const resolve = vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  const event = { url: new URL(url), request: new Request(url, { method, headers }) } as Parameters<Handle>[0]['event'];
  return { response: await handle({ event, resolve }), resolve };
}

test('API access requires a local host and same-origin writes or the configured agent token', async () => {
  vi.stubEnv('MEAT_PROXY_TOKEN', 'test-agent-token');
  const cases = [
    { url: 'http://localhost/api/bootstrap', method: 'GET', headers: {}, status: 200 },
    { url: 'http://localhost/api/action', method: 'POST', headers: { origin: 'http://localhost' }, status: 200 },
    { url: 'http://localhost/api/action', method: 'POST', headers: {}, status: 403 },
    { url: 'http://localhost/api/bootstrap', method: 'GET', headers: { origin: 'https://example.test' }, status: 403 },
    { url: 'http://localhost/api/action', method: 'POST', headers: { authorization: 'Bearer wrong-token' }, status: 403 },
    { url: 'http://127.0.0.1/api/action', method: 'POST', headers: { authorization: 'Bearer test-agent-token' }, status: 200 },
    { url: 'http://example.test/api/action', method: 'POST', headers: { authorization: 'Bearer test-agent-token' }, status: 403 }
  ];
  for (const item of cases) {
    const { response, resolve } = await request(item.url, item.method, item.headers as Record<string, string>);
    expect(response.status, `${item.method} ${item.url} ${JSON.stringify(item.headers)}`).toBe(item.status);
    expect(resolve).toHaveBeenCalledTimes(item.status === 200 ? 1 : 0);
  }
});

test('successful API responses disable caching and add browser security headers', async () => {
  const { response } = await request('http://localhost/api/bootstrap');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
});
