import { Alert, Button, Checkbox, CircularProgress, FormControlLabel, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import type { PaymentRequestDetail } from '@nless/shared/features/payments/types';
import { formatDateTime, formatMoney, FormDialog, SectionCard, useApiMutation, useApiQuery, useCan } from '../../core';

type Review = { slipId: string; decision: 'accepted' | 'rejected' };

function ReviewDialog({ requestId, review, onClose, onSaved }: {
  requestId: string; review: Review; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation('payments');
  const [bankConfirmed, setBankConfirmed] = useState(false);
  const accept = review.decision === 'accepted';
  const save = useApiMutation<{ decision: 'accepted'; bankConfirmed: true } | { decision: 'rejected' }, PaymentRequestDetail>(
    'POST', '/payments/' + encodeURIComponent(requestId) + '/slips/' + encodeURIComponent(review.slipId) + '/review',
  );
  return <FormDialog open title={t(accept ? 'slips.accept' : 'slips.reject')} onClose={onClose}
    submitDisabled={accept && !bankConfirmed} submitting={save.running} error={save.error ? t('failed') : null}
    onSubmit={async () => {
      await save.run(accept ? { decision: 'accepted', bankConfirmed: true } : { decision: 'rejected' });
      onSaved();
    }}>
    {accept ? <FormControlLabel label={t('slips.bankConfirmed')} control={
      <Checkbox checked={bankConfirmed} onChange={(event) => setBankConfirmed(event.target.checked)} />
    } /> : <Typography>{t('slips.rejectConfirm')}</Typography>}
  </FormDialog>;
}

export default function SlipReview({ requestId, onClose, onChanged }: {
  requestId: string; onClose: () => void; onChanged: () => void;
}) {
  const { t } = useTranslation('payments');
  const detail = useApiQuery<PaymentRequestDetail>('/payments/' + encodeURIComponent(requestId));
  const canWrite = useCan('orders.write');
  const [review, setReview] = useState<Review | null>(null);
  return <SectionCard title={t('slips.title')} actions={<Button onClick={onClose}>{t('slips.close')}</Button>}>
    {detail.loading && <CircularProgress aria-label={t('loading')} size={24} />}
    {detail.error && <Alert severity="error" action={<Button onClick={detail.reload}>{t('retry')}</Button>}>{t('failed')}</Alert>}
    {detail.data && <Stack spacing={1.5}>
      <Typography>{detail.data.orderNumber} · {formatMoney(detail.data.amountMinor)}</Typography>
      {detail.data.slips.length ? <>
        <Alert severity="info">{t('slips.preliminary')}</Alert>
        {detail.data.slips.map((slip) => <Stack key={slip.id} spacing={0.5}>
          <Typography sx={{ fontWeight: 600 }}>{t('slips.verdict.' + slip.verdict)}</Typography>
          <Typography variant="body2">
            {[slip.amountMinor === null ? null : formatMoney(slip.amountMinor),
              slip.transferredAt ? formatDateTime(slip.transferredAt) : null, slip.transactionRefMasked].filter(Boolean).join(' · ')}
          </Typography>
          {slip.staffDecision && <Typography variant="body2">{t('slips.' + slip.staffDecision)}</Typography>}
          {canWrite && !slip.staffDecision && detail.data?.state === 'pending_verification' && <Stack direction="row" spacing={1}>
            {slip.verdict !== 'duplicate' && <Button onClick={() => setReview({ slipId: slip.id, decision: 'accepted' })}>{t('slips.accept')}</Button>}
            <Button onClick={() => setReview({ slipId: slip.id, decision: 'rejected' })}>{t('slips.reject')}</Button>
          </Stack>}
        </Stack>)}
      </> : <Typography>{t('slips.empty')}</Typography>}
      {detail.data.conversationId && <Button component={RouterLink} to={'/chat?c=' + detail.data.conversationId} sx={{ alignSelf: 'start' }}>
        {t('slips.conversation')}
      </Button>}
    </Stack>}
    {review && <ReviewDialog requestId={requestId} review={review} onClose={() => setReview(null)} onSaved={() => {
      setReview(null);
      detail.reload();
      onChanged();
    }} />}
  </SectionCard>;
}
