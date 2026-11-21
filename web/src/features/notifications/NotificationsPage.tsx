import { useState } from 'react';
import { Alert, Button, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MarkReadInput, NotificationFeed, NotificationItem } from '@nless/shared/features/notifications/types';
import {
  DataTable, EmptyState, PageHeader, StatusChip, formatDateTime, useApiMutation, useApiQuery, useToast,
} from '../../core';
import { notificationsRead } from './events';

function NotificationsList({ unreadOnly }: { unreadOnly: boolean }) {
  const { t } = useTranslation('notifications');
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<NotificationItem[]>([]);
  const params = new URLSearchParams();
  if (unreadOnly) params.set('unread', 'true');
  if (cursor) params.set('cursor', cursor);
  const feed = useApiQuery<NotificationFeed>('/notifications' + (params.size ? '?' + params : ''));
  const read = useApiMutation<MarkReadInput, { updated: number }>('POST', '/notifications/read');
  const items = [...new Map([...previous, ...(feed.data?.items ?? [])].map((item) => [item.id, item])).values()];

  async function mark(input: MarkReadInput) {
    await read.run(input);
    window.dispatchEvent(new Event(notificationsRead));
    setPrevious([]);
    if (cursor) setCursor(null);
    else feed.reload();
  }

  async function openItem(item: NotificationItem) {
    if (!item.read) await mark({ ids: [item.id] });
    if (item.link) navigate(item.link);
  }

  return <Stack spacing={2}>
    <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
      <Button disabled={read.running || !feed.data?.unreadCount}
        onClick={() => { void mark({ all: true }).catch(() => undefined); }}>{t('bell.markAll')}</Button>
    </Stack>
    {feed.error && <Alert severity="error" action={<Button onClick={feed.reload}>{t('common.retry')}</Button>}>{t('bell.error')}</Alert>}
    {(!feed.error || items.length > 0) && <DataTable rows={items} rowKey={(item) => item.id} loading={feed.loading}
      empty={<EmptyState title={t('empty.title')} description={t('empty.description')} />}
      onRowClick={read.running ? undefined : (item) => { void openItem(item).catch(() => undefined); }}
      columns={[
        { key: 'type', header: t('col.type'), render: (item) => <StatusChip status={item.type} label={t('type.' + item.type)} /> },
        { key: 'message', header: t('col.message'), render: (item) => <>
          <Typography sx={{ fontWeight: item.read ? 400 : 700, minWidth: 130, overflowWrap: 'anywhere' }}>{item.title}</Typography>
          {item.body && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{item.body}</Typography>}
        </> },
        { key: 'time', header: t('col.time'), render: (item) => formatDateTime(item.createdAt) },
        { key: 'state', header: t('col.state'), render: (item) => item.read ? t('state.read') : t('state.unread') },
      ]} />}
    {feed.data?.nextCursor && <Button disabled={feed.loading} onClick={() => {
      setPrevious(items);
      setCursor(feed.data!.nextCursor);
    }}>{t('loadMore')}</Button>}
  </Stack>;
}

export default function NotificationsPage() {
  const { t } = useTranslation('notifications');
  const { success, error } = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const test = useApiMutation<Record<string, never>, { notificationId: string | null }>('POST', '/notifications/test');

  async function sendTest() {
    const reply = await test.run({});
    if (reply.notificationId) {
      success(t('settings.testSent'));
      window.dispatchEvent(new Event(notificationsRead));
    } else {
      error(t('settings.testFailed'));
    }
  }

  return <>
    <PageHeader title={t('page.title')} actions={<Button variant="outlined" disabled={test.running}
      onClick={() => { void sendTest().catch(() => undefined); }}>{t('settings.sendTest')}</Button>} />
    <Tabs value={unreadOnly ? 'unread' : 'all'} onChange={(_event, value: string) => setUnreadOnly(value === 'unread')}
      aria-label={t('page.title')}>
      <Tab value="all" label={t('tabs.all')} />
      <Tab value="unread" label={t('tabs.unread')} />
    </Tabs>
    <NotificationsList key={Number(unreadOnly)} unreadOnly={unreadOnly} />
  </>;
}
