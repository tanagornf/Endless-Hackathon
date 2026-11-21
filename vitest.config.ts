import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const env = { NODE_ENV: 'test', MODEL_MODE: 'fake', OPENAI_API_KEY: '', RUN_WORKER: '0', RUN_SCHEDULER: '0', LOG_LEVEL: 'warn' };
const coreIntegration = ['server/src/core/{auth,features,loop,model,meta,demo,channels,realtime,jobs,worker,worker-crash,shutdown,outbox,scheduler,demo-scope,demo-reset,ops}.test.ts', 'server/src/features/**/*.test.ts', 'tests/e2e/*.integration.test.ts'];
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['shared/**/*.test.ts', 'server/src/core/*.test.ts', 'scripts/**/*.test.ts'], exclude: coreIntegration, environment: 'node', env, fileParallelism: false } },
      { test: { name: 'integration', include: coreIntegration, globalSetup: 'server/src/core/test-global-setup.ts', environment: 'node', env, fileParallelism: false } },
      { plugins: [react()], test: { name: 'web', include: ['web/src/**/*.test.{ts,tsx}'], environment: 'jsdom' } },
    ],
  },
});
