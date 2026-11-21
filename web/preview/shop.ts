import type { CatalogItemAdminDetail, CatalogItemRow } from '../../shared/features/catalog/types';
import type { SettingsView } from '../../shared/features/business-settings/types';
import type { LineConnectionView } from '../../shared/features/line/types';

export const shop = { id: 'preview', name: 'Endless · UI preview', language: 'th', timezone: 'Asia/Bangkok', status: 'active' };
export const now = new Date().toISOString();
const hours = [{ open: '10:00', close: '18:00' }];
const settings: SettingsView = {
  profile: { name: shop.name, description: 'A small studio making canvas bags and accessories.', contactEmail: 'studio@example.test', address: 'Bangkok studio', contactPhone: null },
  settings: { businessId: shop.id, language: 'th', aiEnabled: true, timezone: shop.timezone, version: 1,
    hours: { mon: hours, tue: hours, wed: hours, thu: hours, fri: hours, sat: hours, sun: [] }, answerPolicy: null },
  aiSwitch: true, aiBlockedReason: null,
  capabilities: { canQuotePrices: true, canTakeOrders: true, canTakeBookings: true, canHandoffToHuman: true, canShareContact: true },
  effectiveRules: { price: 'always', stock: 'always', contact: 'always', booking: true, orders: true, handoff: true, generalKnowledge: false },
};
const line: LineConnectionView = {
  connected: true, status: 'active', statusReason: null, mode: 'sandbox', channelId: 'preview-line', displayName: 'Canvas Studio · Demo',
  basicId: null, addFriendUrl: null, addFriendQrDataUrl: null, webhookUrl: null, hasAccessToken: false, source: 'ui',
  connectedAt: now, lastVerifiedAt: now, lastEventAt: now, eventsTotal: 1,
  push: { month: now.slice(0, 7), calls: 0, messages: 0, quotaAlertedAt: null, lineQuota: null },
};
export const tote: CatalogItemAdminDetail = {
  id: 'everyday-tote', businessId: shop.id, sku: 'TOTE-01', name: 'กระเป๋าผ้าแคนวาส', nameEn: 'Everyday Canvas Tote',
  kind: 'product', description: 'A natural canvas tote with an inside pocket.', category: 'Bags', unit: 'bag',
  priceMinor: 69000, stock: 12, currency: 'THB', active: true, shippable: true, durationMinutes: null,
  version: 1, variants: [], images: [], createdAt: now, updatedAt: now, priceChangedAt: now, source: 'seed', sourceRef: null,
};
const product: CatalogItemRow = { ...tote, hasVariantPrices: false, minPriceMinor: tote.priceMinor, imageUrl: null, variantCount: 0 };

export function shopPreview(path: string, params: URLSearchParams) {
  switch (path) {
    case '/settings': return settings;
    case '/settings/closures': return { items: [] };
    case '/settings/open-state': return { open: true, reason: 'open', localDate: now.slice(0, 10), localTime: '12:00', timezone: shop.timezone, nextOpenAt: null, closure: null };
    case '/channels/line': return line;
    case '/channels/line/events': return { items: [{ webhookEventId: 'sample-inquiry', eventType: 'message', messageType: 'text', isRedelivery: false, state: 'processed', note: null, receivedAt: now }] };
    case '/catalog/categories': return { items: [{ name: tote.category, count: 1 }] };
    case '/catalog/items': {
      const q = (params.get('q') ?? '').toLowerCase();
      const matches = params.get('status') !== 'inactive' && (!params.get('kind') || params.get('kind') === product.kind)
        && (!params.get('category') || params.get('category') === product.category)
        && [product.name, product.nameEn, product.sku].some(value => value?.toLowerCase().includes(q));
      return { items: matches ? [product] : [], nextCursor: null, missingNameEn: 0 };
    }
    case '/catalog/items/everyday-tote': return tote;
    case '/catalog/items/everyday-tote/history': return { prices: [], stock: [] };
    case '/members': return { items: [{ userId: 'preview', email: 'studio@example.test', displayName: 'Nok · Demo', role: 'owner', status: 'active',
      permissions: [], isAccountOwner: true, isSelf: true, lastSeenAt: now, createdAt: now }] };
    case '/invitations': return { items: !params.get('status') || params.get('status') === 'pending'
      ? [{ id: 'studio-invite', email: 'team@example.test', status: 'pending', invitedByName: 'Nok · Demo', permissions: ['chat.read'],
        createdAt: now, acceptedAt: null, expiresAt: new Date(Date.parse(now) + 7 * 86400000).toISOString() }] : [] };
  }
}
