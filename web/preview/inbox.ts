import type { ConversationDetail, InboxCounts, InboxRow, MessageRecord } from '../../shared/features/inbox/types';
import type { ConversationTeamState } from '../../shared/features/team/types';

const id = 'sample-tote';
const openedAt = new Date(Date.now() - 15 * 60_000).toISOString();
const answeredAt = new Date(Date.now() - 12 * 60_000).toISOString();
const question = 'Hi! Will the canvas tote fit a 13-inch laptop?';
const answer = 'Yes, it fits a 13-inch laptop. The inside pocket keeps your charger separate.';
const demoLink = '/v1/public/demo-chat/canvas-studio';
const demoShop = {
  shopName: 'Canvas Studio · Demo', language: 'th', aiEnabled: false, capReached: false,
  welcomeText: 'ถามเราเกี่ยวกับกระเป๋าผ้าได้เลย', welcomeTextEn: 'Ask us about the Everyday Canvas Tote.',
  suggestedQuestions: ['ใส่แล็ปท็อปได้ไหม'], suggestedQuestionsEn: ['Will it fit my laptop?'],
};
const row: InboxRow = {
  conversationId: id, customerId: 'sample-mali', customerName: 'Mali · Demo', channel: 'web',
  status: 'closed', handler: 'human', assigneeUserId: 'preview', assigneeName: 'UI preview',
  lastMessageAt: answeredAt, lastMessagePreview: answer, unreadCount: 0,
  waitingSince: null, isWaiting: false, version: 1,
};
const detail: ConversationDetail = {
  conversation: {
    id, businessId: 'preview', customerId: row.customerId,
    customer: { displayName: row.customerName, externalId: 'sample-visitor', channelAccountId: null },
    channel: row.channel, status: row.status, handler: row.handler, assigneeUserId: row.assigneeUserId,
    aiForceOn: false, createdAt: openedAt, lastMessageAt: answeredAt, lastInboundAt: openedAt,
    unreadCount: row.unreadCount, version: row.version,
  },
  assigneeName: row.assigneeName, waitingSince: null, isWaiting: false, aiPending: false, aiEnabled: true,
};
const team: ConversationTeamState = {
  conversationId: id, status: row.status, handler: row.handler, version: row.version,
  assigneeUserId: row.assigneeUserId, assigneeName: row.assigneeName,
  isQueued: false, canTakeover: false, candidates: [],
};
const messages: MessageRecord[] = ([
  { seq: 1, text: question, createdAt: openedAt, author: 'customer', direction: 'inbound', authorUserId: null },
  { seq: 2, text: answer, createdAt: answeredAt, author: 'staff', direction: 'outbound', authorUserId: 'preview' },
] as const).map((message): MessageRecord => ({
  ...message, id: id + '-' + message.seq, conversationId: id, businessId: 'preview', channel: row.channel,
  parts: [{ type: 'text', text: message.text }], origin: 'demo', externalId: null, groupId: null,
  delivery: { mode: null, state: 'not_required', externalRef: null, error: null },
}));

export function inboxPreview(method: string | undefined, url: URL) {
  const listPath = '/v1/businesses/preview/conversations';
  const threadPath = '/v1/conversations/' + id;
  if (method === 'POST' && url.pathname === threadPath + '/read') return { unreadCount: 0 };
  if (method === 'POST' && url.pathname === demoLink + '/session') return { visitorToken: 'local-ui-preview' };
  if (method !== 'GET') return;
  switch (url.pathname) {
    case '/v1/businesses/preview/demo-chat/settings':
      return { ...demoShop, enabled: true, publicSlug: 'canvas-studio', publicUrl: '/demo-chat/s/canvas-studio', todayTurns: 1, dailyCap: 10 };
    case demoLink: return demoShop;
    case '/v1/businesses/preview/demo-chat/poll':
    case demoLink + '/poll':
      return { conversationId: id, items: url.searchParams.get('after') ? [] : messages, cursor: 'sample-2', pending: null, closed: true };
    case listPath + '/counts':
      return { all: 1, waiting: 0, active: 0, closed: 1 } satisfies InboxCounts;
    case listPath: {
      const filter = url.searchParams.get('filter') || 'all';
      const assignee = url.searchParams.get('assignee');
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      const matches = (filter === 'all' || filter === row.status) && (!assignee || assignee === 'me')
        && [row.customerName, row.lastMessagePreview].some(text => text.toLowerCase().includes(search));
      return { items: matches ? [row] : [], nextCursor: null };
    }
    case threadPath: return detail;
    case threadPath + '/messages': return { items: messages, nextCursor: null };
    case threadPath + '/team': return team;
  }
}
