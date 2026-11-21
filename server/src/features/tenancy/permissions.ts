import { PERMISSIONS, STAFF_DEFAULT_PERMISSIONS } from '@nless/shared/core/permissions';
import type { MembershipRole, PermissionKey } from '@nless/shared/core/permissions';
import { VIEWER_PERMISSIONS } from '@nless/shared/features/tenancy/types';
import type { PermissionPresetId } from '@nless/shared/features/tenancy/types';
import { AppError } from '../../core';

const keys = Object.keys(PERMISSIONS) as PermissionKey[];
const assignable = keys.filter((key) => PERMISSIONS[key].staff !== 'never');

export const PRESETS: Record<PermissionPresetId, readonly PermissionKey[]> = {
  viewer: VIEWER_PERMISSIONS,
  chat_team: STAFF_DEFAULT_PERMISSIONS,
  manager: assignable,
};

export function validatePermissionKeys(input: readonly string[]): PermissionKey[] {
  const requested = new Set(input);
  const unknown = [...requested].filter((key) => !Object.hasOwn(PERMISSIONS, key));
  const forbidden = keys.filter((key) => PERMISSIONS[key].staff === 'never' && requested.has(key));
  const issues = [];
  if (unknown.length) issues.push({ path: 'permissions', code: 'unknown_permission', keys: unknown });
  if (forbidden.length) issues.push({ path: 'permissions', code: 'forbidden_permission', keys: forbidden });
  if (issues.length) {
    throw new AppError('VALIDATION_ERROR', 'Invalid staff permissions', { details: { issues } });
  }
  return assignable.filter((key) => requested.has(key));
}

export function effectivePermissions(role: MembershipRole, stored: readonly string[]): PermissionKey[] {
  return role === 'owner' ? [...keys] : assignable.filter((key) => stored.includes(key));
}
