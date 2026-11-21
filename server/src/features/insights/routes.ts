import { defineFeatureRoutes } from '../../core';
import { z } from 'zod';
import { merchantReport } from './merchant';

export default defineFeatureRoutes({
  featureId: "F26",
  slug: "insights",
  register(api) {
    api.get('/businesses/:businessId/insights/merchant', {
      auth: 'business', permission: 'insights.read', summary: 'Read merchant chat and order insights',
      query: z.object({ days: z.enum(['7','30']).default('7') }),
    }, async ({ business, query }) => merchantReport(business!.id, Number(query.days)));
    api.get('/features/insights/status', { auth: 'user', summary: 'Merchant insights availability' },
      async () => ({ featureId: 'F26', slug: 'insights', lane: 'B3', implemented: true, mode: 'A', slices: ['merchant-report'] }));
  },
});
