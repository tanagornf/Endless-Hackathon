import { expect, test } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { FEATURES } from '@nless/shared/core/features';
import { featurePages, registryErrors } from './registry';

test('registers all features without route conflicts', () => {
  expect(registryErrors).toEqual([]);
  expect(featurePages).toHaveLength(29);
  for (const feature of FEATURES.filter((entry) => entry.folder)) {
    const pages = featurePages.find((entry) => entry.slug === feature.slug);
    expect(pages?.featureId).toBe(feature.id);
    for (const link of pages?.menu ?? []) {
      expect(matchRoutes(pages?.routes ?? [], link.path), `${feature.id} menu link ${link.path}`).not.toBeNull();
    }
  }
});
