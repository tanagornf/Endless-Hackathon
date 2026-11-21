import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['shared/**/*.test.ts', 'server/src/**/*.test.ts', 'scripts/**/*.test.ts'], environment: 'node', env: { NODE_ENV: 'test', MODEL_MODE: 'fake', OPENAI_API_KEY: '' }, fileParallelism: false } },
      { plugins: [react()], test: { name: 'web', include: ['web/src/**/*.test.{ts,tsx}'], environment: 'jsdom' } },
    ],
  },
});
