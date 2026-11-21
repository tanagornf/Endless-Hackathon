import { defineFeatureRoutes } from '../../core';

export default defineFeatureRoutes({
  featureId: "F30",
  slug: "voice",
  register(api) {
    api.get("/features/voice/status", { auth: 'user', summary: 'placeholder status' }, async () => ({"featureId":"F30","slug":"voice","lane":"B2","implemented":false,"mode":"U"}));
  },
});
