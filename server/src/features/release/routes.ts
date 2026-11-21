import { defineFeatureRoutes } from '../../core';
import { getReleaseStatus } from './service';

export default defineFeatureRoutes({
  featureId: 'F36',
  slug: 'release',
  register(api) {
    api.get('/release/status', { auth: 'platform_admin', summary: 'Read release provenance and feature status' },
      async () => getReleaseStatus(api.readFeatureFlags));
  },
});
