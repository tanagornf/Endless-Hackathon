import { PERMISSIONS, STAFF_DEFAULT_PERMISSIONS } from '@nless/shared/core/permissions';
import { describe, expect, it } from 'vitest';
import { effectivePermissions, PRESETS, validatePermissionKeys } from './permissions';

describe('F03 permission rules', () => {
  it('reports unknown and owner-only keys together, keeping permission validation strict', () => {
    expect(() => validatePermissionKeys(['fake', 'account.members', 'fake', 'account.businesses'])).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR', details: { issues: [
        { path: 'permissions', code: 'unknown_permission', keys: ['fake'] },
        { path: 'permissions', code: 'forbidden_permission', keys: ['account.members', 'account.businesses'] },
      ] } }),
    );
  });

  it('deduplicates and orders allowed staff keys in contract order', () => {
    expect(validatePermissionKeys(['business.read', 'chat.reply', 'chat.reply'])).toEqual(['chat.reply', 'business.read']);
  });

  it('uses canonical owner grants and ignores invalid legacy staff grants', () => {
    expect(effectivePermissions('owner', [])).toEqual(Object.keys(PERMISSIONS));
    expect(effectivePermissions('staff', ['account.members', 'business.read', 'fake'])).toEqual(['business.read']);
  });

  it('defines viewer, chat team and manager presets without owner-only permissions', () => {
    expect(PRESETS.viewer).toEqual(['chat.read', 'orders.read', 'product.read', 'appointments.read', 'business.read']);
    expect(PRESETS.chat_team).toEqual(STAFF_DEFAULT_PERMISSIONS);
    expect(PRESETS.manager).toHaveLength(23);
    expect(PRESETS.manager).not.toContain('account.members');
    expect(PRESETS.manager).not.toContain('account.businesses');
  });
});
