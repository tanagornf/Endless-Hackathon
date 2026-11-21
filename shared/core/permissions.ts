export type MembershipRole = 'owner' | 'staff';

export const PERMISSIONS = {
  'chat.read': { group: 'chat', staff: 'on' },
  'chat.reply': { group: 'chat', staff: 'on' },
  'chat.takeover': { group: 'chat', staff: 'on' },
  'chat.schedule': { group: 'chat', staff: 'off' },
  'chat.view_all': { group: 'chat', staff: 'off' },
  'orders.read': { group: 'orders', staff: 'on' },
  'orders.write': { group: 'orders', staff: 'off' },
  'appointments.read': { group: 'appointments', staff: 'on' },
  'appointments.write': { group: 'appointments', staff: 'on' },
  'appointments.settings': { group: 'appointments', staff: 'off' },
  'product.read': { group: 'product', staff: 'on' },
  'product.write': { group: 'product', staff: 'off' },
  'product.delete': { group: 'product', staff: 'off' },
  'broadcast.read': { group: 'broadcast', staff: 'off' },
  'broadcast.send': { group: 'broadcast', staff: 'off' },
  'broadcast.tags': { group: 'broadcast', staff: 'off' },
  'insights.read': { group: 'insights', staff: 'off' },
  'insights.demo': { group: 'insights', staff: 'off' },
  'business.read': { group: 'business', staff: 'on' },
  'business.update': { group: 'business', staff: 'off' },
  'business.bot_settings': { group: 'business', staff: 'off' },
  'business.channels': { group: 'business', staff: 'off' },
  'business.commerce': { group: 'business', staff: 'off' },
  'account.members': { group: 'account', staff: 'never' },
  'account.businesses': { group: 'account', staff: 'never' },
} as const satisfies Record<string, { group: string; staff: 'on' | 'off' | 'never' }>;

export type PermissionKey = keyof typeof PERMISSIONS;

/** Default grant for a new staff member (the `on` bucket). SPEC §5 Staff A starts with exactly this. */
export const STAFF_DEFAULT_PERMISSIONS: readonly PermissionKey[] = [
  'chat.read', 'chat.reply', 'chat.takeover', 'orders.read',
  'appointments.read', 'appointments.write', 'product.read', 'business.read',
];
