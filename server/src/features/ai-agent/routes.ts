import { z } from 'zod';
import { AppError, defineFeatureRoutes } from '../../core';
import { AI_REPLY_JOB } from '@nless/shared/features/inbox/types';
import { aiReplyJobHandler, getTurnTrace } from './service';

const turnIdSchema = z.string().uuid();

export default defineFeatureRoutes({
  featureId: 'F10',
  slug: 'ai-agent',
  register(api) {
    api.get('/businesses/:businessId/ai/turns/:turnId',
      { auth: 'business', permission: 'chat.read', summary: 'Read an AI turn trace' },
      async ({ business, params }) => {
        const turnId = turnIdSchema.safeParse(params.turnId);
        if (!turnId.success) throw new AppError('VALIDATION_ERROR', 'Invalid AI turn ID');
        const trace = await getTurnTrace(business!.id, turnId.data);
        if (!trace) throw new AppError('NOT_FOUND', 'AI turn not found');
        return trace;
      });
  },
  jobs: { [AI_REPLY_JOB]: aiReplyJobHandler },
});
