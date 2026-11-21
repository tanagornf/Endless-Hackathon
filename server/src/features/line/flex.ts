import { formatMoneyText, type CustomerLanguage } from '@nless/shared/core/language';
import type { ActionButtonsPart, BookingReviewPart, MessagePart, OrderReviewPart, ProductCardPart } from '@nless/shared/core/types';

const FLEX_MAX_BYTES = 45_000;
const BUBBLE_MAX_BYTES = 30_000;
const CAROUSEL_MAX_BUBBLES = 10;
const QUICK_REPLY_MAX_ITEMS = 13;
const BUTTON_MAX_ITEMS = 4;
const LABEL_MAX_CHARACTERS = 20;
const ACTION_TEXT_MAX_CHARACTERS = 300;
const ALT_MAX_CHARACTERS = 400;
const COMPACT_TEXT_MAX_CHARACTERS = 1_500;
const REVIEW_MAX_LINES = 8;
const SOLD_OUT_COLOR = '#B91C1C';
const PRIMARY_COLOR = '#0F766E';
const POSTBACK_DATA = /^nl:a:[A-Za-z0-9]{12}$/;

const labels = {
  th: {
    catalog: 'สินค้า',
    soldOut: 'สินค้าหมด',
    lowStock: (quantity: number) => `เหลือ ${quantity} ชิ้น`,
    interested: 'สนใจ',
    interestText: (name: string) => `สนใจ ${name}`,
    order: 'สรุปออเดอร์',
    orderAlt: (total: string) => `สรุปออเดอร์ รวม ${total} เปิดดูในแอป LINE เพื่อยืนยัน`,
    more: (quantity: number) => `และอีก ${quantity} รายการ`,
    subtotal: 'ยอดสินค้า',
    delivery: 'ค่าส่ง',
    total: 'รวม',
    deadline: (time: string) => `ยืนยันได้ถึง ${time}`,
    confirmOrder: 'ยืนยันสั่งซื้อ',
    booking: 'สรุปนัดหมาย',
    bookingAlt: (time: string) => `สรุปนัดหมาย ${time} เปิดดูในแอป LINE เพื่อยืนยัน`,
    confirmBooking: 'ยืนยันนัดหมาย',
    cancel: 'ยกเลิก',
    choose: 'เลือกได้เลยค่ะ',
  },
  en: {
    catalog: 'Catalog',
    soldOut: 'Sold out',
    lowStock: (quantity: number) => `${quantity} left`,
    interested: 'Interested',
    interestText: (name: string) => `Interested in ${name}`,
    order: 'Order summary',
    orderAlt: (total: string) => `Order summary, total ${total}. Open in the LINE app to confirm.`,
    more: (quantity: number) => `and ${quantity} more`,
    subtotal: 'Items',
    delivery: 'Delivery',
    total: 'Total',
    deadline: (time: string) => `Confirm before ${time}`,
    confirmOrder: 'Confirm order',
    booking: 'Booking summary',
    bookingAlt: (time: string) => `Booking summary ${time}. Open in the LINE app to confirm.`,
    confirmBooking: 'Confirm booking',
    cancel: 'Cancel',
    choose: 'Please choose an option.',
  },
};

type Awaitable<T> = T | Promise<T>;
type ReviewPart = OrderReviewPart | BookingReviewPart;
type PlainPart = Extract<MessagePart, { type: 'text' | 'image' | 'file' }>;
type ProposalButton = Extract<ActionButtonsPart['buttons'][number]['action'], { kind: 'confirm_proposal' }>;

export type LineProposalActionRequest = Omit<ProposalButton, 'kind'> & (
  | { source: 'review'; kind: 'order' | 'booking'; expiresAt: string }
  | { source: 'button' }
);

export interface LineFlexOptions {
  language: CustomerLanguage;
  resolveSquareImage?: (fileId: string) => Awaitable<string | null>;
  resolveActionData?: (input: LineProposalActionRequest) => Awaitable<string | null>;
}

type MessageAction = { type: 'message'; label: string; text: string };
type PostbackAction = { type: 'postback'; label: string; displayText: string; data: string };
type UriAction = { type: 'uri'; label: string; uri: string };
type LineAction = MessageAction | PostbackAction | UriAction;

type FlexText = {
  type: 'text';
  text: string;
  wrap: true;
  weight?: 'bold';
  maxLines?: number;
  color?: string;
  size?: 'xs' | 'sm' | 'md';
  align?: 'end';
  flex?: number;
};
type FlexButton = { type: 'button'; action: LineAction; height: 'sm'; style?: 'primary'; color?: string };
type FlexBox = { type: 'box'; layout: 'vertical' | 'horizontal'; spacing?: 'sm'; contents: FlexContent[] };
type FlexContent = FlexText | FlexButton | FlexBox | { type: 'separator' };
type FlexBubble = {
  type: 'bubble';
  size?: 'kilo';
  header?: FlexBox;
  hero?: { type: 'image'; url: string; size: 'full'; aspectRatio: '1:1'; aspectMode: 'cover' };
  body: FlexBox;
  footer?: FlexBox;
};

export interface LineFlexMessage {
  type: 'flex';
  altText: string;
  contents: FlexBubble | { type: 'carousel'; contents: FlexBubble[] };
}

export interface LineFlexFallback {
  type: 'text';
  text: string;
}

export interface LineQuickReply {
  items: { type: 'action'; action: MessageAction }[];
}

type RichMessage = LineFlexMessage | LineFlexFallback;

function clip(value: string, max: number): string {
  return Array.from(value).slice(0, max).join('');
}

function messageAction(label: string, value: string): MessageAction {
  return { type: 'message', label: clip(label, LABEL_MAX_CHARACTERS), text: clip(value, ACTION_TEXT_MAX_CHARACTERS) };
}

function text(value: string, options: Omit<FlexText, 'type' | 'text' | 'wrap'> = {}): FlexText {
  return { type: 'text', text: value, wrap: true, ...options };
}

function vertical(contents: FlexContent[]): FlexBox {
  return { type: 'box', layout: 'vertical', spacing: 'sm', contents };
}

function button(action: LineAction, primary = false): FlexButton {
  return primary
    ? { type: 'button', action, height: 'sm', style: 'primary', color: PRIMARY_COLOR }
    : { type: 'button', action, height: 'sm' };
}

function httpsUrl(value: string | null | undefined, max: number): value is string {
  if (!value?.startsWith('https://') || value.length > max) return false;
  const url = URL.parse(value);
  return url !== null && url.href.length <= max;
}

function price(minor: number, language: CustomerLanguage): string {
  const amount = formatMoneyText(minor, language).replace(/ (?:บาท|baht)$/u, '');
  return '฿' + amount;
}

function formatDeadline(expiresAt: string, language: CustomerLanguage): string | null {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  const fields = new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const field = (type: Intl.DateTimeFormatPartTypes) => fields.find((entry) => entry.type === type)?.value;
  return `${field('day')} ${field('month')} ${field('hour')}:${field('minute')}`;
}

function byteLength(value: object): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function flexMessage(altText: string, bubbles: FlexBubble[]): LineFlexMessage {
  return { type: 'flex', altText, contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles } };
}

function compactBox(box: FlexBox): FlexBox {
  return {
    ...box,
    contents: box.contents.map((component) => {
      if (component.type === 'box') return compactBox(component);
      if (component.type === 'text') return { ...component, text: clip(component.text, COMPACT_TEXT_MAX_CHARACTERS) };
      return component;
    }),
  };
}

function fitBubble(bubble: FlexBubble, altText: string): FlexBubble | null {
  const fits = (candidate: FlexBubble) =>
    byteLength(candidate) <= BUBBLE_MAX_BYTES && byteLength(flexMessage(altText, [candidate])) <= FLEX_MAX_BYTES;
  if (fits(bubble)) return bubble;
  const compact = { ...bubble, body: compactBox(bubble.body) };
  return fits(compact) ? compact : null;
}

function singleBubble(bubble: FlexBubble, altText: string): RichMessage {
  const clippedAlt = clip(altText, ALT_MAX_CHARACTERS);
  const fitted = fitBubble(bubble, clippedAlt);
  return fitted ? flexMessage(clippedAlt, [fitted]) : { type: 'text', text: clippedAlt };
}

async function products(part: ProductCardPart, options: LineFlexOptions): Promise<RichMessage[]> {
  const copy = labels[options.language];
  const suppliedAlt = part.altText.trim() ? part.altText : '';
  const altText = clip(suppliedAlt || part.items[0]?.name.trim() || copy.catalog, ALT_MAX_CHARACTERS);
  if (!part.items.length) return suppliedAlt ? [{ type: 'text', text: altText }] : [];

  const messages: RichMessage[] = [];
  let carousel: FlexBubble[] = [];
  for (const item of part.items) {
    const name = item.name.trim() || item.sku.trim() || copy.catalog;
    const body = [text(name, { weight: 'bold', maxLines: 2 }), text(price(item.unitPriceMinor, options.language))];
    if (item.soldOut) {
      body.push(text(copy.soldOut, { size: 'sm', color: SOLD_OUT_COLOR }));
    } else if (item.available !== null && item.available >= 1 && item.available <= 5) {
      body.push(text(copy.lowStock(item.available), { size: 'sm' }));
    }

    const bubble: FlexBubble = { type: 'bubble', size: 'kilo', body: vertical(body) };
    const image = item.imageFileId ? await options.resolveSquareImage?.(item.imageFileId) : null;
    if (httpsUrl(image, 2_000)) {
      bubble.hero = { type: 'image', url: image, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' };
    }
    if (!item.soldOut) {
      bubble.footer = vertical([button(messageAction(copy.interested, copy.interestText(name)), true)]);
    }

    const fitted = fitBubble(bubble, altText);
    if (!fitted || carousel.length === CAROUSEL_MAX_BUBBLES
      || byteLength(flexMessage(altText, [...carousel, fitted])) > FLEX_MAX_BYTES) {
      if (carousel.length) messages.push(flexMessage(altText, carousel));
      carousel = [];
    }
    if (fitted) carousel.push(fitted);
    else messages.push({ type: 'text', text: altText });
  }
  if (carousel.length) messages.push(flexMessage(altText, carousel));
  return messages;
}

function amountRow(label: string, amount: string, bold = false): FlexBox {
  const weight = bold ? { weight: 'bold' } as const : {};
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      text(label, { ...weight, size: 'sm', flex: 5 }),
      text(amount, { ...weight, size: 'sm', align: 'end', flex: 4 }),
    ],
  };
}

async function postback(
  label: string,
  request: LineProposalActionRequest,
  resolve: LineFlexOptions['resolveActionData'],
): Promise<PostbackAction | null> {
  const data = await resolve?.(request);
  if (!data || !POSTBACK_DATA.test(data)) return null;
  const clippedLabel = clip(label, LABEL_MAX_CHARACTERS);
  return { type: 'postback', label: clippedLabel, displayText: clippedLabel, data };
}

async function review(part: ReviewPart, options: LineFlexOptions): Promise<RichMessage> {
  const copy = labels[options.language];
  const deadline = formatDeadline(part.expiresAt, options.language);
  const isOrder = part.type === 'order_review';
  const kind = isOrder ? 'order' : 'booking';
  let altText: string;
  let body: FlexContent[];

  if (isOrder) {
    const money = (minor: number) => price(minor, options.language);
    const total = money(part.totalMinor);
    body = part.lines.slice(0, REVIEW_MAX_LINES).map(
      (line) => amountRow(`${line.name} × ${line.quantity}`, money(line.lineTotalMinor)),
    );
    if (part.lines.length > REVIEW_MAX_LINES) {
      body.push(text(copy.more(part.lines.length - REVIEW_MAX_LINES), { size: 'sm' }));
    }
    body.push(
      { type: 'separator' },
      amountRow(copy.subtotal, money(part.subtotalMinor)),
      amountRow(copy.delivery, money(part.deliveryFeeMinor)),
      amountRow(copy.total, total, true),
    );
    if (deadline) body.push(text(copy.deadline(deadline), { size: 'xs' }));
    altText = copy.orderAlt(total);
  } else {
    body = [text(part.serviceName), text(part.resourceName), text(part.localDisplay, { weight: 'bold' })]
      .filter((entry) => entry.text.trim());
    altText = copy.bookingAlt(part.localDisplay);
  }

  const header = isOrder ? copy.order : copy.booking;
  const bubble: FlexBubble = {
    type: 'bubble',
    header: vertical([text(header, { weight: 'bold' })]),
    body: vertical(body.length ? body : [text(header)]),
  };
  const message = singleBubble(bubble, altText);
  if (message.type === 'text' || !deadline || !options.resolveActionData) return message;

  const bindings = {
    source: 'review',
    kind,
    proposalId: part.proposalId,
    version: part.version,
    reviewToken: part.reviewToken,
    expiresAt: part.expiresAt,
  } as const;
  const confirm = await postback(isOrder ? copy.confirmOrder : copy.confirmBooking, { ...bindings, decision: 'confirm' }, options.resolveActionData);
  const cancel = await postback(copy.cancel, { ...bindings, decision: 'cancel' }, options.resolveActionData);
  const footer: FlexButton[] = [];
  if (confirm && confirm.data !== cancel?.data) footer.push(button(confirm, true));
  if (cancel && cancel.data !== confirm?.data) footer.push(button(cancel));
  if (message.contents.type !== 'bubble' || !footer.length) return message;
  return singleBubble({ ...message.contents, footer: vertical(footer) }, message.altText);
}

async function actionButtons(part: ActionButtonsPart, options: LineFlexOptions): Promise<RichMessage[]> {
  const buttons: FlexButton[] = [];
  for (const entry of part.buttons.slice(0, BUTTON_MAX_ITEMS)) {
    const label = entry.label.trim();
    if (!label) continue;
    const { action } = entry;
    switch (action.kind) {
      case 'postback': {
        const data = action.data.trim();
        const useData = data && Array.from(data).length <= ACTION_TEXT_MAX_CHARACTERS;
        buttons.push(button(messageAction(label, useData ? data : label)));
        break;
      }
      case 'link':
        if (httpsUrl(action.url, 1_000)) {
          buttons.push(button({ type: 'uri', label: clip(label, LABEL_MAX_CHARACTERS), uri: action.url }));
        }
        break;
      case 'confirm_proposal': {
        const resolved = await postback(label, {
          source: 'button', proposalId: action.proposalId, version: action.version,
          reviewToken: action.reviewToken, decision: action.decision,
        }, options.resolveActionData);
        if (resolved) buttons.push(button(resolved));
        break;
      }
    }
  }
  const copy = part.text?.trim();
  if (!copy && !buttons.length) return [];
  const prompt = copy || labels[options.language].choose;
  const bubble: FlexBubble = { type: 'bubble', body: vertical([text(prompt)]) };
  if (buttons.length) bubble.footer = vertical(buttons);
  return [singleBubble(bubble, prompt)];
}

/** Converts one complete delivery. Callers supply tenant-scoped resolvers and batch the resulting messages. */
export async function formatLineFlexDelivery<T extends { type: string }>(
  parts: readonly MessagePart[],
  options: LineFlexOptions,
  formatPlainPart: (part: PlainPart) => Awaitable<readonly T[]>,
): Promise<Array<(T | LineFlexMessage | LineFlexFallback) & { quickReply?: LineQuickReply }>> {
  type OutboundMessage = (T | RichMessage) & { quickReply?: LineQuickReply };
  const messages: OutboundMessage[] = [];
  const quickItems: LineQuickReply['items'] = [];

  for (const part of parts) {
    switch (part.type) {
      case 'product_card':
        messages.push(...await products(part, options));
        break;
      case 'order_review':
      case 'booking_review':
        messages.push(await review(part, options));
        break;
      case 'action_buttons':
        if (!part.text?.trim() && part.buttons.length <= QUICK_REPLY_MAX_ITEMS
          && part.buttons.every((entry) => entry.action.kind === 'postback')) {
          for (const entry of part.buttons) {
            if (quickItems.length === QUICK_REPLY_MAX_ITEMS) break;
            const label = entry.label.trim();
            if (label && entry.action.kind === 'postback') {
              quickItems.push({ type: 'action', action: messageAction(label, entry.action.data.trim() || label) });
            }
          }
        } else {
          messages.push(...await actionButtons(part, options));
        }
        break;
      default:
        messages.push(...await formatPlainPart(part));
    }
  }

  if (quickItems.length) {
    const quickReply = { items: quickItems };
    const last = messages.at(-1);
    if (last) {
      const withReplies = { ...last, quickReply };
      if (last.type !== 'flex' || byteLength(withReplies) <= FLEX_MAX_BYTES) {
        messages[messages.length - 1] = withReplies;
        return messages;
      }
    }
    // Keep the replies on the last object even if the Flex envelope has no room for them.
    messages.push({ type: 'text', text: labels[options.language].choose, quickReply });
  }
  return messages;
}
