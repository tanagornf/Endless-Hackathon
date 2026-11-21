import type { FeatureApi } from '../../core';
import { answerOwnerConsult, getOwnerConsult, OwnerConsultAnswerBody } from './owner-consult';

const path = '/businesses/:businessId/settings/owner-consults/:caseId';
const ownerScope = { auth: 'business', permission: 'business.bot_settings' } as const;

export function registerOwnerConsultRoutes(api: FeatureApi): void {
  api.get(path, { ...ownerScope, summary: 'Read a shop owner consultation' },
    async ({ params, scope, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      return getOwnerConsult(scope!, params.caseId!);
    });
  api.post(path + '/answer', { ...ownerScope, body: OwnerConsultAnswerBody, summary: 'Record a shop owner answer' },
    async ({ params, scope, body, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      return answerOwnerConsult(scope!, { ...body, caseId: params.caseId! });
    });
}
