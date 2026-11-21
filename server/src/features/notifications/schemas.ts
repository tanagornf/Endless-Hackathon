import { z } from 'zod';
import { PERMISSIONS } from '@nless/shared/core/permissions';
import type { PermissionKey } from '@nless/shared/core/permissions';
import { NOTIFICATION_TYPES } from '@nless/shared/features/notifications/types';
import { AppError } from '../../core';

const InternalPath = /^\/(?!\/)[^\\\s\x00-\x1f\x7f]*$/;
export function isInternalPath(path: string): boolean { return InternalPath.test(path); }

const uuid = z.uuid();
const NotificationType = z.enum(NOTIFICATION_TYPES);
const permissionKey = z.custom<PermissionKey>((value) =>
  typeof value === 'string' && Object.hasOwn(PERMISSIONS, value));

export const NotifyInputSchema = z.strictObject({
  businessId: uuid,
  to: z.union([
    z.strictObject({ userIds: z.array(uuid).min(1).max(200) }),
    z.strictObject({ role: z.literal('owners') }),
    z.strictObject({ permission: permissionKey }),
  ]),
  type: NotificationType,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(1000).optional(),
  link: z.string().max(500).refine(isInternalPath).optional(),
  dedupKey: z.string().min(1).max(200).optional(),
});

export const FeedQuery = z.object({
  cursor: z.string().max(200).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  unread: z.literal('true').optional(),
});
export type FeedOptions = z.infer<typeof FeedQuery>;

export const ReadBody = z.union([
  z.strictObject({ ids: z.array(uuid).min(1).max(100) }),
  z.strictObject({ all: z.literal(true) }),
]);

const FeedCursor = z.strictObject({ createdAt: z.iso.datetime(), id: uuid });
export function readCursor(cursor: string | undefined): z.infer<typeof FeedCursor> | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url');
    if (raw.toString('base64url') === cursor) {
      const parsed = FeedCursor.safeParse(JSON.parse(raw.toString('utf8')));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Use the same validation response for malformed JSON and unsupported cursors.
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid notification cursor');
}

const PreferenceInput = z.strictObject({ type: NotificationType, inApp: z.boolean(), push: z.boolean() });
export const PreferencesBody = z.strictObject({
  items: z.array(PreferenceInput).min(1).max(NOTIFICATION_TYPES.length),
}).superRefine(({ items }, ctx) => {
  if (new Set(items.map(({ type }) => type)).size !== items.length) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'A notification type can only be set once' });
  }
  if (items.some(({ type, inApp }) => type === 'system' && !inApp)) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'System notifications must remain in the app' });
  }
});
