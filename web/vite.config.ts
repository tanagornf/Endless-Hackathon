import { markScaffoldRoutes } from './scaffold-routes';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const root = fileURLToPath(new URL('./', import.meta.url));
const envDir = fileURLToPath(new URL('../', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  const target = 'http://localhost:' + (env.API_PORT || '3000');
  return {
    root, envDir, plugins: [markScaffoldRoutes(), react()],
    server: { port: Number(env.WEB_PORT || 5170), strictPort: true, proxy: {
      ...Object.fromEntries(['/api', '/webhooks', '/health', '/healthz', '/readyz', '/build-info'].map((path) => [path, { target }])),
      '/ws': { target, ws: true },
    } },
    build: { outDir: 'dist' },
  };
});
