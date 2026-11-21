import { defineFeatureRoutes } from '../../core';
import { AI_REPLY_JOB } from '@nless/shared/features/inbox/types';
import { aiReplyJobHandler } from './service';

export default defineFeatureRoutes({
  featureId: "F10",
  slug: "ai-agent",
  register(api) {
    api.get("/features/ai-agent/status", { auth: 'user', summary: 'placeholder status' }, async () => ({"featureId":"F10","slug":"ai-agent","lane":"B2","implemented":false,"mode":"U"}));
  },
  jobs: { [AI_REPLY_JOB]: aiReplyJobHandler },
});
