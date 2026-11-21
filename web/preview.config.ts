import { markScaffoldRoutes } from './scaffold-routes';
// Local design review only. All API traffic terminates here, before any proxy or backend.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { FEATURES } from '../shared/core/features';
import { PERMISSIONS } from '../shared/core/permissions';
import { inboxPreview } from './preview/inbox';
import { knowledgePreview } from './preview/knowledge';
import { shop, shopPreview } from './preview/shop';
import { businessViews, globalViews } from './preview/workspace';

const businessPrefix = '/v1/businesses/' + shop.id + '/';
export default defineConfig({
  define: { 'import.meta.env.VITE_UI_PREVIEW': JSON.stringify('1') },
  root: fileURLToPath(new URL('./', import.meta.url)),
  server: { host: '127.0.0.1', port: 5189, strictPort: true, watch: { usePolling: process.platform === 'win32', interval: 700 } },
  plugins: [markScaffoldRoutes(), react(), {
    name: 'isolated-ui-preview',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const route = url.pathname;
        let data: unknown;
        if (req.method === 'GET' && route === '/v1/me') {
          data = { user: { id: 'preview', displayName: 'UI preview', isPlatformAdmin: true }, businesses: [{ business: shop, role: 'owner', permissions: Object.keys(PERMISSIONS) }] };
        } else if (req.method === 'GET' && route === '/v1/features/visible') {
          data = { visibleFeatureIds: FEATURES.filter(f => f.folder).map(f => f.id) };
        } else if (req.method === 'GET' && route === '/v1/features') {
          data = { production: false, items: FEATURES.filter(f => f.folder).map(f => ({ featureId: f.id, slug: f.slug, visible: true, hidden: false, placeholder: true })) };
        } else {
          data = inboxPreview(req.method, url);
          if (data === undefined && req.method === 'GET' && route.startsWith(businessPrefix)) {
            const path = route.slice(businessPrefix.length - 1);
            data = knowledgePreview(path, url.searchParams) ?? shopPreview(path, url.searchParams)
              ?? (Object.hasOwn(businessViews, path) ? businessViews[path] : undefined);
          } else if (data === undefined && req.method === 'GET' && route.startsWith('/v1/')) {
            const path = route.slice(3);
            if (path === '/auth/mailbox') data = { scope: url.searchParams.get('scope') === 'all' ? 'all' : 'mine', items: [] };
            else if (Object.hasOwn(globalViews, path)) data = globalViews[path];
          }
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        if (data !== undefined) return res.end(JSON.stringify({ data }));
        res.statusCode = 503;
        res.end(JSON.stringify({ error: { code: 'SERVICE_NOT_READY', retryable: true, message: 'Local UI preview' }, meta: {} }));
      });
    },
  }],
});
