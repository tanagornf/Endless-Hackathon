import { expect, test } from 'vitest';
import { assertSafeDbName } from './db';

test.each(['nless_hack_a0', 'nless_hack_c3_test'])('allows the lane database %s', (name) => {
  expect(() => assertSafeDbName(name)).not.toThrow();
});

test.each(['nless_hack_main', 'nless_hack_a4', 'prod', 'postgres'])('rejects the database %s', (name) => {
  expect(() => assertSafeDbName(name)).toThrow();
});
