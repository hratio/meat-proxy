// This constant also works inside the rendering worker and plain Node tests.
declare const __MEAT_PROXY_BASE__: string;
const base = typeof __MEAT_PROXY_BASE__ === 'undefined' ? '' : __MEAT_PROXY_BASE__;

/** Keep custom/remote URLs intact and prefix shipped assets once. */
export function assetUrl(url: string): string {
  return base && url.startsWith('/') && !url.startsWith('//') && url !== base && !url.startsWith(`${base}/`) ? base + url : url;
}
