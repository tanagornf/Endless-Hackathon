import { defineFeatureRoutes } from '../../core';

export default defineFeatureRoutes({
  featureId: "F21",
  slug: "comments",
  register(api) {
    api.get("/features/comments/status", { auth: 'user', summary: 'placeholder status' }, async () => ({"featureId":"F21","slug":"comments","lane":"C2","implemented":false,"mode":"U"}));
  },
});
