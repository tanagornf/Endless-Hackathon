import { describe, expect, it } from 'vitest';
import { canReceivePhoneAlert, classifyNotificationPush, notificationPushPurpose } from './provenance';

const businessId = 'fdd89c9a-486f-4e79-b38b-58176726595a';
const otherBusiness = 'c6f7afee-21a0-4069-ac82-bd3b8231d750';
const conversationId = '6f4f637d-4909-4d33-8a25-78e5748a4e14';
const caseId = '5f8841f4-131c-442f-bcb4-c167c774a22b';
const actionStepId = 'a71b5ccf-29f9-45f9-9575-245b3a0436d5';
const handoff = { businessId, type: 'chat.handoff', to: { permission: 'chat.takeover' } } as const;
const owner = { businessId, type: 'system', to: { role: 'owners' } } as const;
const marker = 'staff-offer-accepted:' + businessId + ':' + conversationId + ':v12';
const ownerMarker = 'ai-owner-review:' + businessId + ':' + caseId + ':' + actionStepId;
const canonical = 'handoff:' + conversationId + ':v12';

describe('phone alert provenance', () => {
  it('classifies only accepted, committed staff offers and retains canonical versioned bell dedup', () => {
    const eligible = classifyNotificationPush({ ...handoff, dedupKey: marker });
    expect(eligible).toEqual({ dedupKey: canonical, purpose: { kind: 'staff-offer', conversationId, version: 12 } });
    expect(classifyNotificationPush({ ...handoff, dedupKey: canonical })).toEqual({ dedupKey: canonical, purpose: null });
    expect(classifyNotificationPush({ ...handoff, dedupKey: 'intent:' + conversationId }).purpose).toBeNull();
    expect(classifyNotificationPush({ ...handoff, businessId: otherBusiness, dedupKey: marker }).purpose).toBeNull();
  });

  it('requires the same business and owner-only audience for an owner knowledge consult', () => {
    expect(classifyNotificationPush({ ...owner, dedupKey: ownerMarker })).toEqual({
      dedupKey: ownerMarker, purpose: { kind: 'owner-consult', caseId, actionStepId },
    });
    expect(classifyNotificationPush({ ...owner, businessId: otherBusiness, dedupKey: ownerMarker }).purpose).toBeNull();
    expect(classifyNotificationPush({ ...owner, type: 'report', dedupKey: ownerMarker }).purpose).toBeNull();
    expect(classifyNotificationPush({ ...owner, to: { permission: 'business.read' }, dedupKey: ownerMarker }).purpose).toBeNull();
    expect(classifyNotificationPush({ ...owner, dedupKey: 'job:' + caseId + ':dead' }).purpose).toBeNull();
  });

  it('rejects malformed metadata and reapplies distinct role/permission rules', () => {
    expect(notificationPushPurpose.safeParse({ kind: 'staff-offer', conversationId, version: -1 }).success).toBe(false);
    const staffPurpose = classifyNotificationPush({ ...handoff, dedupKey: marker }).purpose!;
    const ownerPurpose = classifyNotificationPush({ ...owner, dedupKey: ownerMarker }).purpose!;
    expect(canReceivePhoneAlert(staffPurpose, 'staff', ['chat.read', 'chat.takeover'])).toBe(true);
    expect(canReceivePhoneAlert(staffPurpose, 'staff', ['chat.read'])).toBe(false);
    expect(canReceivePhoneAlert(ownerPurpose, 'staff', ['business.read'])).toBe(false);
    expect(canReceivePhoneAlert(ownerPurpose, 'owner', [])).toBe(true);
  });
});
