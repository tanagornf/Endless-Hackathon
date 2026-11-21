import { audit, publish } from '../../core';

export async function recordSettingsChange(
  businessId: string, actorUserId: string, action: string, version: number, details: Record<string, unknown> = {},
): Promise<void> {
  await audit({ action, businessId, actorUserId, targetType: 'business', targetId: businessId, details });
  publish(businessId, {
    type: 'custom', featureId: 'F04', name: 'business-settings.changed', data: { version },
  });
}
