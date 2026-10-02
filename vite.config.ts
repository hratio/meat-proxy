import { sveltekit } from '@sveltejs/kit/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type UserConfig } from 'vite';
import { studioPlugin } from './dev/server/studio-plugin.ts';
import { fileURLToPath } from 'node:url';

export default defineConfig((): UserConfig => {
  const workbench = process.env.MEAT_PROXY_WORKBENCH === '1';
  const noReload = process.env.MEAT_PROXY_NO_RELOAD === '1';
  return {
    server: {
      ...(noReload ? { hmr: false, watch: null } : {}),
      // Workshops load preview components and preserved artwork from dev/.
      ...(workbench ? { fs: { allow: [
        './dev/ui', './dev/assets'
      ].map(path => fileURLToPath(new URL(path, import.meta.url))) } } : {})
    },
    define: { __MEAT_PROXY_BASE__: JSON.stringify(process.env.MEAT_PROXY_PAGES === '1' ? process.env.MEAT_PROXY_BASE || '' : '') },
    plugins: [
      { name: 'meat-proxy-release-boundary', apply: 'build', buildStart() {
        if (workbench) throw new Error('Release builds cannot include development workshops. Unset MEAT_PROXY_WORKBENCH.');
      } },
      {
        name: 'meat-proxy-woff2-fonts',
        enforce: 'pre',
        transform(code, id) {
          if (!/\/@fontsource\/ibm-plex-mono\/[^/?]+\.css(?:\?|$)/.test(id)) return;
          // Keep Fontsource's language subsets, but omit legacy WOFF duplicates.
          return { code: code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, ''), map: null };
        }
      },
      ...(workbench ? [studioPlugin()] : []),
      tailwindcss(), enhancedImages(), sveltekit()
    ],
    build: {
      target: "es2022",
      minify: "oxc",
      sourcemap: false,
      license: { fileName: 'THIRD_PARTY_NOTICES.md' }
    },
    worker: { format: 'es' },
    // Exclude studio modules before Svelte compiles their template factories.
    resolve: {
      alias: Object.fromEntries([
        ['$dev-panel', 'DevPanel'], ['$dev-menu', 'DevMenu'], ['$dev-cycle', 'DevCycle']
      ].map(([name, component]) => [name, fileURLToPath(new URL(workbench ? `./dev/ui/${component}.svelte` : './src/lib/components/DevPlaceholder.svelte', import.meta.url))]))
    }
  };
});
