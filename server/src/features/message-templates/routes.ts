import { defineFeatureRoutes } from '../../core';

export default defineFeatureRoutes({
  featureId: "F12",
  slug: "message-templates",
  register(api) {
    api.get("/features/message-templates/status", { auth: 'user', summary: 'placeholder status' }, async () => ({"featureId":"F12","slug":"message-templates","lane":"A1","implemented":false,"mode":"U"}));
  },
});
