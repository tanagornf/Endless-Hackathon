import { z } from 'zod';
import type { FeatureApi } from '../../core';
import { parseSettingsInput } from './schemas';
import {
  getShopInstructionCandidate, listShopInstructions, publishShopInstruction, rollbackShopInstruction,
} from './shop-instructions-repo';

const root = '/businesses/:businessId/settings/shop-instructions';
const ownerRoute = { auth: 'business', permission: 'business.bot_settings' } as const;
const identifier = z.uuid();
const rollbackTarget = z.union([identifier, z.literal('baseline')]);
const activation = z.object({ expectedActiveVersionId: identifier.nullable() }).strict();

export function registerShopInstructionRoutes(api: FeatureApi): void {
  api.get(root, { ...ownerRoute, summary: 'List shop instruction candidates and versions' }, async ({ scope, res }) => {
    res.setHeader('Cache-Control', 'no-store');
    return listShopInstructions(scope!);
  });
  api.get(root + '/candidates/:candidateId', { ...ownerRoute, summary: 'Review a shop instruction candidate' },
    async ({ params, scope, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      return getShopInstructionCandidate(scope!, parseSettingsInput(identifier, params.candidateId));
    });
  api.post(root + '/candidates/:candidateId/publish', { ...ownerRoute, body: activation, summary: 'Publish a shop instruction candidate' },
    async ({ body, params, scope, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      return publishShopInstruction(scope!, parseSettingsInput(identifier, params.candidateId), body.expectedActiveVersionId);
    });
  api.post(root + '/versions/:versionId/rollback', { ...ownerRoute, body: activation, summary: 'Restore a prior shop instruction revision' },
    async ({ body, params, scope, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      const versionId = parseSettingsInput(rollbackTarget, params.versionId);
      return rollbackShopInstruction(scope!, versionId === 'baseline' ? null : versionId, body.expectedActiveVersionId);
    });
}
