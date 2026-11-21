import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const source = readFileSync(resolve(root, 'contracts.ts'), 'utf8');
const boundaries = [...source.matchAll(/^\/\/ ═══ target: shared\/features\/([^/]+)\/types\.ts.*$/gm)];

test('publishes the frozen setup service signatures for all fifteen service contracts', async () => {
  const expected = boundaries.flatMap((match, index) => {
    const chunk = source.slice(match.index, boundaries[index + 1]?.index);
    const names = [...chunk.matchAll(/^export declare (?:function|const) (\w+)/gm)].map((entry) => entry[1]);
    return names.length ? [{ slug: match[1], names }] : [];
  });
  expect(expected).toHaveLength(15);
  expect(readdirSync(resolve(root, 'server/src/features'), { withFileTypes: true }).filter((entry) => entry.isDirectory())).toHaveLength(29);
  for (const { slug, names } of expected) {
    const service = await import(pathToFileURL(resolve(root, 'server/src/features/' + slug + '/service.ts')).href) as Record<string, unknown>;
    for (const name of names) expect(typeof service[name], slug + '/' + name).toBe('function');
  }
});
