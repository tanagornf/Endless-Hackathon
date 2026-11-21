import { defineFeatureRoutes } from '../../core';

export default defineFeatureRoutes({
  featureId: "F06",
  slug: "knowledge-import",
  register(api) {
    api.get("/features/knowledge-import/status", { auth: 'user', summary: 'placeholder status' }, async () => ({"featureId":"F06","slug":"knowledge-import","lane":"B3","implemented":false,"mode":"U"}));
  },
});
