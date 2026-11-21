import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const blueprint = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');

test('Render prompts for the external production database and does not provision another one', () => {
  expect(blueprint).not.toMatch(/^databases:|\bfromDatabase:/m);
  expect(blueprint).toMatch(/key:\s*DATABASE_URL,\s*sync:\s*false/);
});

test.each(['APP_BASE_URL', 'WEB_ORIGIN', 'PUBLIC_BASE_URL'])('%s uses this service’s assigned public URL', (key) => {
  const entry = blueprint.split('\n').find((line) => line.includes('key: ' + key + ','));
  expect(entry).toMatch(/fromService:\s*\{\s*name:\s*nless-hack,\s*type:\s*web,\s*envVarKey:\s*RENDER_EXTERNAL_URL/);
});
