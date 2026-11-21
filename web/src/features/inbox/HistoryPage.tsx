import { useEffect, useState } from 'react';
import { Alert, Button, Paper, Skeleton, Stack, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Page } from '@nless/shared/core/types';
import type { MessageRecord } from '@nless/shared/features/inbox/types';
import { api, EmptyState, formatDateTime, PageHeader } from '../../core';

export default function HistoryPage() {
  const { t } = useTranslation('inbox');
  const { conversationId } = useParams();
  const [view, setView] = useState<Page<MessageRecord> | null>(null);
  const [before, setBefore] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    void api.get<Page<MessageRecord>>('/conversations/' + encodeURIComponent(conversationId) + '/messages', { before: before ?? undefined })
      .then((page) => {
        if (active) setView(page);
      }, () => {
        if (active) setFailed(true);
      }).finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [conversationId, before, revision]);

  return (
    <Stack spacing={2}>
      <PageHeader title={t('history.title')} />
      {loading ? <Skeleton height={112} /> : failed ? (
        <Alert severity="error" action={<Button onClick={() => setRevision((value) => value + 1)}>{t('history.retry')}</Button>}>
          {t('history.unavailable')}
        </Alert>
      ) : !view?.items.length ? <EmptyState title={t('history.empty')} /> : (
        <Stack spacing={1}>
          {view.items.map((message) => (
            <Paper key={message.id} variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                {t('history.' + message.author)} · {formatDateTime(message.createdAt)}
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text}</Typography>
            </Paper>
          ))}
          <Stack direction="row" spacing={1}>
            {view.nextCursor && <Button onClick={() => setBefore(view.nextCursor)}>{t('history.older')}</Button>}
            {before && <Button onClick={() => setBefore(null)}>{t('history.latest')}</Button>}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
