import { markScaffoldRoutes } from './scaffold-routes';
// Local design review only. All API traffic terminates here, before any proxy or backend.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { FEATURES } from '../shared/core/features';
import { PERMISSIONS } from '../shared/core/permissions';

const business = { id: 'preview', name: 'Endless · UI preview', language: 'th', timezone: 'Asia/Bangkok', status: 'active' };
export default defineConfig({
  define: { 'import.meta.env.VITE_UI_PREVIEW': JSON.stringify('1') },
  root: fileURLToPath(new URL('./', import.meta.url)),
  server: { host: '127.0.0.1', port: 5189, strictPort: true, watch: { usePolling: process.platform === 'win32', interval: 700 } },
  plugins: [markScaffoldRoutes(), react(), {
    name: 'isolated-ui-preview',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        const route = req.url?.split('?')[0];
        let data: unknown;
        if (req.method === 'GET' && route === '/v1/me') {
          data = { user: { id: 'preview', displayName: 'UI preview', isPlatformAdmin: true }, businesses: [{ business, role: 'owner', permissions: Object.keys(PERMISSIONS) }] };
        } else if (req.method === 'GET' && route === '/v1/features/visible') {
          data = { visibleFeatureIds: FEATURES.filter(f => f.folder).map(f => f.id) };
        } else if (req.method === 'GET' && route === '/v1/features') {
          data = { production: false, items: FEATURES.filter(f => f.folder).map(f => ({ featureId: f.id, slug: f.slug, visible: true, hidden: false, placeholder: true })) };
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        if (data) return res.end(JSON.stringify({ data }));
        res.statusCode = 503;
        res.end(JSON.stringify({ error: { code: 'SERVICE_NOT_READY', retryable: true, message: 'Local UI preview' }, meta: {} }));
      });
    },
  }],
});
