import { z } from 'zod';
import { HISTORY_MAX, PARTS_MAX, PART_TEXT_MAX } from './limits';

export const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

export function isSafeMessageLink(value: string): boolean {
  if (/[\u0000-\u0020\\]/u.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  if (!value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname && !url.username && !url.password);
  } catch {
    return false;
  }
}

function clampText(text: string) {
  const characters = [...text];
  return characters.length > PART_TEXT_MAX ? characters.slice(0, PART_TEXT_MAX - 1).join('') + '…' : text;
}

const nonblank = z.string().trim().min(1);
const uuid = z.string().regex(uuidPattern);
const minor = z.number().int().nonnegative();
const version = z.number().int().positive();

const buttonAction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('postback'), data: nonblank }),
  z.object({ kind: z.literal('link'), url: z.string().refine(isSafeMessageLink) }),
  z.object({
    kind: z.literal('confirm_proposal'), proposalId: nonblank, version, reviewToken: nonblank,
    decision: z.enum(['confirm', 'cancel']),
  }),
]);

const messagePart = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: nonblank.transform(clampText) }),
  z.object({ type: z.literal('image'), fileId: uuid, alt: z.string().optional() }),
  z.object({ type: z.literal('file'), fileId: uuid, fileName: nonblank, mimeType: nonblank, sizeBytes: minor }),
  z.object({
    type: z.literal('product_card'), altText: nonblank,
    items: z.array(z.object({
      itemId: nonblank, variantId: nonblank.nullable(), sku: nonblank, name: nonblank, unitPriceMinor: minor,
      currency: z.literal('THB'), available: minor.nullable(), soldOut: z.boolean(), imageFileId: uuid.optional(), version,
    })).min(1).max(10),
  }),
  z.object({
    type: z.literal('order_review'), proposalId: nonblank, version,
    lines: z.array(z.object({
      itemId: nonblank, variantId: nonblank.nullable(), sku: nonblank, name: nonblank,
      quantity: z.number().int().positive(), unitPriceMinor: minor, lineTotalMinor: minor,
    })).min(1),
    subtotalMinor: minor, deliveryFeeMinor: minor, totalMinor: minor, currency: z.literal('THB'),
    expiresAt: nonblank, reviewToken: nonblank,
  }),
  z.object({
    type: z.literal('booking_review'), proposalId: nonblank, version, serviceName: nonblank, resourceName: nonblank,
    startAt: nonblank, endAt: nonblank, timezone: nonblank, localDisplay: nonblank, expiresAt: nonblank, reviewToken: nonblank,
  }),
  z.object({
    type: z.literal('action_buttons'), text: z.string().optional(),
    buttons: z.array(z.object({ id: nonblank, label: nonblank, action: buttonAction })).min(1).max(4),
  }),
]);

export const messagePartsSchema = z.array(messagePart).min(1).max(PARTS_MAX);

export const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(HISTORY_MAX).optional(),
  before: z.string().min(1).max(100).optional(),
  after: z.string().min(1).max(100).optional(),
}).refine(({ before, after }) => !(before && after));

export const listConversationsQuery = z.object({
  filter: z.enum(['all', 'waiting', 'active', 'closed']).catch('all').default('all'),
  assignee: z.string().trim().max(40).optional(),
  search: z.string().trim().max(120).optional(),
  cursor: z.string().min(1).max(300).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const staffSendBody = z.object({
  clientRequestId: z.string().trim().min(8).max(80),
  text: z.string().max(2000).optional(),
  attachments: z.array(z.object({ fileId: uuid, kind: z.enum(['image', 'file']) })).max(4).default([]),
}).refine(({ text, attachments }) => Boolean(text?.trim()) || attachments.length > 0);

export const demoPollQuery = z.object({
  after: z.string().min(1).max(100).optional(),
  waitMs: z.coerce.number().int().min(0).max(20000).default(0),
});

export const demoSendBody = z.object({
  clientRequestId: z.string().trim().min(8).max(80),
  text: z.string().max(4000),
});

export const demoSessionBody = z.object({ visitorToken: z.string().max(160).optional() }).default({});

export const demoSettingsBody = z.object({
  enabled: z.boolean(),
  publicSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/u),
  welcomeText: z.string().trim().min(1).max(300).nullable(),
  suggestedQuestions: z.array(z.string().trim().min(1).max(80)).max(4),
  welcomeTextEn: z.string().trim().min(1).max(300).nullable().default(null),
  suggestedQuestionsEn: z.array(z.string().trim().min(1).max(80)).max(4).default([]),
});

export const demoActionBody = z.object({
  clientRequestId: z.string().trim().min(8).max(80),
  kind: z.enum(['order', 'booking']),
  proposalId: z.string().min(1).max(100),
  version: z.number().int().min(1),
  reviewToken: z.string().min(1).max(500),
  decision: z.enum(['confirm', 'cancel']),
});
