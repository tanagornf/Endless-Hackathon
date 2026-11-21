import { useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { BookingReviewPart, ConfirmRequest, MessagePart, OrderReviewPart } from '@nless/shared/core/types';
import { formatDateTime, formatMoney } from '../../core';

type Review = OrderReviewPart | BookingReviewPart;
export type ReviewAction = Omit<ConfirmRequest, 'clientRequestId'> & { kind: 'order' | 'booking' };
type Props = {
  parts: MessagePart[];
  fileUrl: (id: string) => string;
  onReview?: (action: ReviewAction) => Promise<void>;
  onPostback?: (text: string) => void;
};

export function mergeMessages<T extends { id: string; seq: number }>(previous: T[], incoming: T[]): T[] {
  const messages = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((first, second) => first.seq - second.seq);
}

function safeLink(url: string): boolean {
  if (/^\/(?![\/\\])/.test(url) && !/[\r\n\\]/.test(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function ReviewCard({ part, onReview }: { part: Review; onReview?: Props['onReview'] }) {
  const { t } = useTranslation('inbox');
  const [result, setResult] = useState<ReviewAction['decision']>();
  const [waiting, setWaiting] = useState<ReviewAction['decision']>();
  const [expired, setExpired] = useState(() => Date.parse(part.expiresAt) <= Date.now());
  const kind = part.type === 'order_review' ? 'order' : 'booking';
  useEffect(() => {
    const remaining = Date.parse(part.expiresAt) - Date.now();
    setExpired(remaining <= 0);
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setExpired(true), Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [part.expiresAt]);

  async function decide(decision: ReviewAction['decision']) {
    if (!onReview || waiting || result || expired) return;
    setWaiting(decision);
    try {
      await onReview({ kind, proposalId: part.proposalId, version: part.version, reviewToken: part.reviewToken, decision });
      setResult(decision);
    } catch {
      // The chat displays the server error beside the composer.
    } finally {
      setWaiting(undefined);
    }
  }

  return <Stack spacing={0.75} sx={{ borderRadius: 2, p: 1.5, bgcolor: 'background.paper', color: 'text.primary' }}>
    <Typography sx={{ fontWeight: 700 }}>{t('parts.' + kind)}</Typography>
    {part.type === 'order_review' ? <>
      {part.lines.map((line, index) => <Stack key={line.itemId + ':' + index} direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
        <Typography variant="body2">{line.name} × {line.quantity}</Typography>
        <Typography variant="body2" sx={{ flexShrink: 0 }}>{formatMoney(line.lineTotalMinor, part.currency)}</Typography>
      </Stack>)}
      <Typography variant="body2">{t('parts.subtotal')} {formatMoney(part.subtotalMinor, part.currency)}</Typography>
      <Typography variant="body2">{t('parts.delivery')} {formatMoney(part.deliveryFeeMinor, part.currency)}</Typography>
      <Typography sx={{ fontWeight: 700 }}>{t('parts.total')} {formatMoney(part.totalMinor, part.currency)}</Typography>
    </> : <>
      <Typography variant="body2">{part.serviceName} · {part.resourceName}</Typography>
      <Typography variant="body2">{part.localDisplay}</Typography>
    </>}
    <Typography variant="caption">{t('parts.expires', { date: formatDateTime(part.expiresAt) })}</Typography>
    {result || expired || !onReview ? <Typography variant="body2">{t(
      result ? result === 'confirm' ? 'parts.confirmed' : 'parts.cancelled' : expired ? 'parts.expired' : 'parts.awaitingCustomer',
    )}</Typography> : <Stack direction="row" spacing={1}>
      {(['confirm', 'cancel'] as const).map((decision) => <Button key={decision} size="small"
        variant={decision === 'confirm' ? 'contained' : 'outlined'} sx={{ minHeight: 44 }}
        data-testid={kind + '-review-' + decision} disabled={Boolean(waiting)} onClick={() => void decide(decision)}>
        {waiting === decision ? <CircularProgress size={16} /> : t('parts.' + decision)}
      </Button>)}
    </Stack>}
  </Stack>;
}

export function MessageParts({ parts, fileUrl, onReview, onPostback }: Props) {
  const { t } = useTranslation('inbox');
  return <Stack spacing={1}>
    {parts.map((part, index) => {
      switch (part.type) {
        case 'text':
          return <Typography key={index} sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{part.text}</Typography>;
        case 'image': {
          const url = fileUrl(part.fileId);
          return <Box key={index} component="a" href={url} target="_blank" rel="noopener noreferrer"
            sx={{ display: 'block', maxWidth: 280, width: '100%' }}>
            <Box component="img" src={url} alt={part.alt || t('parts.image')} loading="lazy"
              sx={{ display: 'block', width: '100%', maxWidth: 280, height: 'auto', borderRadius: 1 }} />
          </Box>;
        }
        case 'file':
          return <Chip key={index} component="a" clickable href={fileUrl(part.fileId)} target="_blank"
            rel="noopener noreferrer" label={t('parts.file', { name: part.fileName, size: Math.max(1, Math.round(part.sizeBytes / 1024)) })}
            sx={{ minHeight: 44, maxWidth: '100%', width: 'fit-content' }} />;
        case 'product_card':
          return <Stack key={index} direction="row" spacing={1} sx={{ overflowX: 'auto', maxWidth: '100%', pb: 0.5 }}>
            {part.items.map((item) => <Stack key={item.itemId + ':' + (item.variantId ?? '')}
              spacing={0.5} sx={{ minWidth: 124, width: 144, flexShrink: 0, p: 1, bgcolor: 'background.paper', borderRadius: 2 }}>
              {item.imageFileId && <Box component="img" src={fileUrl(item.imageFileId)} alt={item.name}
                loading="lazy" sx={{ width: '100%', height: 72, objectFit: 'cover', borderRadius: 1 }} />}
              <Typography variant="caption" color="text.secondary">{item.sku}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.name}</Typography>
              <Typography variant="body2">{formatMoney(item.unitPriceMinor, item.currency)}</Typography>
              {item.soldOut && <Chip size="small" color="warning" label={t('parts.soldOut')} />}
            </Stack>)}
          </Stack>;
        case 'order_review':
        case 'booking_review':
          return <ReviewCard key={part.proposalId + ':' + part.version} part={part} onReview={onReview} />;
        case 'action_buttons':
          return <Stack key={index} spacing={0.5} sx={{ alignItems: 'flex-start' }}>
            {part.text && <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{part.text}</Typography>}
            {part.buttons.map(({ id, label, action }) => {
              if (action.kind === 'link' && safeLink(action.url)) {
                return <Button key={id} variant="outlined" href={action.url} target="_blank"
                  rel="noopener noreferrer" sx={{ minHeight: 44 }}>{label}</Button>;
              }
              if (action.kind === 'postback') {
                return <Button key={id} variant="outlined" disabled={!onPostback} sx={{ minHeight: 44 }}
                  onClick={() => onPostback?.(action.data.trim() && Array.from(action.data).length <= 500 ? action.data : label)}>
                  {label}
                </Button>;
              }
              return null;
            })}
          </Stack>;
      }
    })}
  </Stack>;
}
