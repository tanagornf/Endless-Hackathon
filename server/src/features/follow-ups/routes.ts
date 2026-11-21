import { defineFeatureRoutes } from '../../core';

export default defineFeatureRoutes({
  featureId: "F38",
  slug: "follow-ups",
  register(api) {
    api.get("/features/follow-ups/status", { auth: 'user', summary: 'placeholder status' }, async () => ({"featureId":"F38","slug":"follow-ups","lane":"B2","implemented":false,"mode":"U"}));
  },
});
