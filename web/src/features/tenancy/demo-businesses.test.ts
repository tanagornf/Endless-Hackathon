import { SEED } from '@nless/shared/core/fixtures';
import { expect, it } from 'vitest';
import { demoBusinesses } from './demo-businesses';

it('marks the same demo shops as the server fixture', () => {
  expect(demoBusinesses).toEqual(new Set(SEED.businesses.map(({ id }) => id)));
});
