import { z } from 'zod';
import { AppError, defineFeatureRoutes } from '../../core';
import { AI_REPLY_JOB } from '@nless/shared/features/inbox/types';
import { readOwnerConsultAnswer, registerOwnerConsultAnswerConsumer } from '../business-settings/service';
import { createOwnerConsultResumeHandler, OWNER_CONSULT_RESUME_JOB } from './ownerConsult';
import { aiReplyJobHandler, getAiTurnMetrics, getTurnTrace, listTurns } from './service';
import { listTurnsQuery } from './trace';

const turnIdSchema = z.string().uuid();
const metricsQuery = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() });
const timestampKey = (iso: string) => iso.replace(/(?:\.(\d+))?Z$/, (_match, fraction = '') => '.' + fraction.padEnd(6, '0'));

export default defineFeatureRoutes({
  featureId: 'F10',
  slug: 'ai-agent',
  register(api) {
    registerOwnerConsultAnswerConsumer();
    api.get('/businesses/:businessId/ai/turns',
      { auth: 'business', permission: 'chat.read', summary: 'List AI turns' },
      async ({ business, query }) => {
        const filters = listTurnsQuery.safeParse(query);
        if (!filters.success) throw new AppError('VALIDATION_ERROR', 'Invalid AI turn filters');
        return listTurns(business!.id, filters.data);
      });
    api.get('/businesses/:businessId/ai/turns/:turnId',
      { auth: 'business', permission: 'chat.read', summary: 'Read an AI turn trace' },
      async ({ business, params }) => {
        const turnId = turnIdSchema.safeParse(params.turnId);
        if (!turnId.success) throw new AppError('VALIDATION_ERROR', 'Invalid AI turn ID');
        const trace = await getTurnTrace(business!.id, turnId.data);
        if (!trace) throw new AppError('NOT_FOUND', 'AI turn not found');
        return trace;
      });
    api.get('/businesses/:businessId/ai/metrics',
      { auth: 'business', permission: 'chat.read', summary: 'Read AI turn metrics' },
      async ({ business, query }) => {
        const parsed = metricsQuery.safeParse(query);
        if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Invalid AI metrics range');
        const to = parsed.data.to ?? new Date().toISOString();
        const from = parsed.data.from ?? new Date(Date.parse(to) - 7 * 86_400_000).toISOString();
        if (timestampKey(from) >= timestampKey(to)) throw new AppError('VALIDATION_ERROR', 'AI metrics range must be increasing');
        return getAiTurnMetrics(business!.id, { from, to });
      });
  },
  jobs: {
    [AI_REPLY_JOB]: aiReplyJobHandler,
    [OWNER_CONSULT_RESUME_JOB]: createOwnerConsultResumeHandler(readOwnerConsultAnswer),
  },
});
