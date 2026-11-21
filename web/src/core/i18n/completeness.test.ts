import { expect, test } from 'vitest';
import { FEATURES } from '@nless/shared/core/features';

const features = import.meta.glob('../../features/*/i18n/*.json', { eager: true, import: 'default' });
const core = import.meta.glob('./*/*.json', { eager: true, import: 'default' });

function flattened(value: object, prefix = ''): [string, string][] {
  return Object.entries(value).flatMap(([name, child]): [string, string][] => {
    const key = prefix + name;
    return typeof child === 'string' ? [[key, child]] : child && typeof child === 'object' ? flattened(child, key + '.') : [[key, '']];
  });
}
const all = [
  ...['common', 'nav'].map((name) => [name, core['./th/' + name + '.json'], core['./en/' + name + '.json']] as const),
  ...FEATURES.filter((feature) => feature.folder).map(({ slug }) => [slug, features['../../features/' + slug + '/i18n/th.json'], features['../../features/' + slug + '/i18n/en.json']] as const),
];
test.each(all)('%s translations have matching usable keys', (_name, thai, english) => {
  expect(thai).toBeTruthy();
  expect(english).toBeTruthy();
  const th = flattened(thai as object);
  const en = flattened(english as object);
  expect(th.map(([key]) => key).sort()).toEqual(en.map(([key]) => key).sort());
  for (const [, value] of [...th, ...en]) expect(value.trim()).not.toBe('');
  for (const [key, value] of en) if (!key.endsWith('.example')) expect(value).not.toMatch(/\p{Script=Thai}/u);
});
