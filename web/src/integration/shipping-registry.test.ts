import { expect, test, vi } from 'vitest';
import type { FeaturePages } from '@nless/shared/core/loader';
import { featurePages } from '../core/registry';

// Feature registrations import the identity helper from the UI barrel, which also loads the registry.
vi.mock('../core', () => ({ defineFeaturePages: (pages: FeaturePages) => pages }));

const owners = Object.values(import.meta.glob<{ default: FeaturePages }>('../features/*/pages.tsx', { eager: true }));

test('the shipping registry exposes precisely the routes and menus registered by each lane', () => {
  for (const { default: owner } of owners) {
    const actual = featurePages.find(feature => feature.featureId === owner.featureId);
    expect(actual?.routes, owner.featureId).toEqual(owner.routes);
    expect(actual?.menu, owner.featureId).toEqual(owner.menu);
  }
});
