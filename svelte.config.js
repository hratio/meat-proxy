import adapter from '@sveltejs/adapter-node';
import staticAdapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { distributionAdapter } from './dev/tooling/build/audio.mjs';

const workbench = process.env.MEAT_PROXY_WORKBENCH === '1';
const pages = process.env.MEAT_PROXY_PAGES === '1';
const base = pages ? (process.env.MEAT_PROXY_BASE || '') : '';
if (pages && workbench) throw new Error('Choose either the Pages demo or the development workshops.');
if (base && (!base.startsWith('/') || base.endsWith('/') || /[?#\\]/.test(base))) throw new Error('MEAT_PROXY_BASE must be empty or a path such as /meat-proxy, without a trailing slash.');

export default {
  preprocess: vitePreprocess(),
  kit: {
    outDir: process.env.MEAT_PROXY_KIT_DIR || (pages ? '.svelte-kit-pages' : workbench ? '.svelte-kit-dev' : '.svelte-kit'),
    files: { routes: pages ? 'site/routes' : workbench ? 'dev/routes' : 'src/routes', hooks: { server: pages ? 'site/hooks.server' : 'src/hooks.server' } },
    paths: { base },
    alias: { $workbench: './dev/ui', '$review-client': pages ? './site/client.ts' : './src/lib/review-client/http.ts' },
    adapter: distributionAdapter(pages ? staticAdapter({ pages: 'build-pages', assets: 'build-pages', fallback: '404.html' }) : adapter({ out: process.env.MEAT_PROXY_BUILD_DIR || 'build', precompress: false }))
  }
};
