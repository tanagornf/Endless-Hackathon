import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert, Badge, Box, Button, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText,
  Popover, Skeleton, Stack, Tooltip, Typography,
} from '@mui/material';
import AssessmentOutlined from '@mui/icons-material/AssessmentOutlined';
import ChatBubbleOutlineOutlined from '@mui/icons-material/ChatBubbleOutlineOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import PersonAddOutlined from '@mui/icons-material/PersonAddOutlined';
import ShoppingCartOutlined from '@mui/icons-material/ShoppingCartOutlined';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  MarkReadInput, NotificationFeed, NotificationItem, NotificationType, UnreadCount,
} from '@nless/shared/features/notifications/types';
import { formatDateTime, useApiMutation, useApiQuery, useRealtime, useSession } from '../../core';

import { notificationsChanged } from './events';

const icons = {
  'chat.handoff': ChatBubbleOutlineOutlined,
  'chat.mention': ChatBubbleOutlineOutlined,
  'order.created': ShoppingCartOutlined,
  'payment.verifying': PaymentsOutlined,
  'booking.created': EventOutlined,
  'booking.cancelled': EventOutlined,
  invitation: PersonAddOutlined,
  report: AssessmentOutlined,
  system: NotificationsNoneOutlined,
} satisfies Record<NotificationType, typeof NotificationsNoneOutlined>;

function age(createdAt: string, language: string) {
  const seconds = Math.min(0, (Date.parse(createdAt) - Date.now()) / 1000);
  if (seconds <= -86400 || !Number.isFinite(seconds)) return formatDateTime(createdAt);
  const relative = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  if (seconds <= -3600) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 60), 'minute');
}

class BellBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() { return { broken: true }; }
  render() { return this.state.broken ? this.props.fallback : this.props.children; }
}

function Bell({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation('notifications');
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const unread = useApiQuery<UnreadCount>('/notifications/unread-count');
  const feed = useApiQuery<NotificationFeed>(anchor ? '/notifications?limit=10' : null);
  const read = useApiMutation<MarkReadInput, { updated: number }>('POST', '/notifications/read');
  const reloadUnread = unread.reload;
  const reloadFeed = feed.reload;

  useEffect(() => {
    const refresh = () => {
      reloadUnread();
      if (anchor) reloadFeed();
    };
    const timer = window.setInterval(reloadUnread, 120000);
    window.addEventListener('focus', reloadUnread);
    window.addEventListener(notificationsChanged, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', reloadUnread);
      window.removeEventListener(notificationsChanged, refresh);
    };
  }, [anchor, reloadFeed, reloadUnread]);

  useRealtime('notification.created', (event) => {
    if (event.userId === userId) {
      reloadUnread();
      if (anchor) reloadFeed();
    }
  });

  const count = unread.data?.count ?? feed.data?.unreadCount ?? 0;
  const elsewhere = unread.data?.elsewhere ?? 0;

  async function mark(input: MarkReadInput) {
    await read.run(input);
    window.dispatchEvent(new Event(notificationsChanged));
  }

  async function openItem(item: NotificationItem) {
    if (!item.read) await mark({ ids: [item.id] });
    setAnchor(null);
    if (item.link) navigate(item.link);
  }

  if (unread.error?.error.code === 'NOT_FOUND') return null;

  return <>
    <Tooltip title={elsewhere ? t('bell.elsewhere', { count: elsewhere }) : t('bell.title')}>
      <IconButton data-testid="notif-bell" aria-label={t('bell.title')} aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget)} sx={{ minWidth: 44, minHeight: 44 }}>
        <Badge color="warning" variant="dot" invisible={!elsewhere} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
          <Badge color="error" badgeContent={count ? <span data-testid="notif-badge">{count > 99 ? '99+' : count}</span> : null}>
            <NotificationsNoneOutlined />
          </Badge>
        </Badge>
      </IconButton>
    </Tooltip>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { width: 360, maxWidth: 'calc(100vw - 24px)' } } }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', p: 1.5, gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('bell.title')}</Typography>
        <Button size="small" disabled={!count || read.running}
          onClick={() => { void mark({ all: true }).catch(() => undefined); }}>{t('bell.markAll')}</Button>
      </Stack>
      <Divider />
      {feed.loading ? <Stack spacing={1} sx={{ p: 2 }}>{[0, 1, 2].map((row) => <Skeleton key={row} height={35} />)}</Stack>
        : feed.error ? <Alert severity="error" action={<Button size="small" onClick={reloadFeed}>{t('common.retry')}</Button>}>{t('bell.error')}</Alert>
        : feed.data?.items.length ? <List disablePadding sx={{ maxHeight: 'min(420px, 55dvh)', overflowY: 'auto' }}>
          {feed.data.items.map((item) => {
            const Icon = icons[item.type];
            return <ListItemButton key={item.id} disabled={read.running}
              onClick={() => { void openItem(item).catch(() => undefined); }} sx={{ alignItems: 'flex-start' }}>
              <ListItemIcon sx={{ minWidth: 34, mt: 0.75 }}><Icon fontSize="small" /></ListItemIcon>
              <ListItemText disableTypography primary={<Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: item.read ? 400 : 700, overflowWrap: 'anywhere' }}>{item.title}</Typography>
                {!item.read && <Box aria-label={t('state.unread')} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />}
              </Stack>} secondary={<>
                {item.body && <Typography variant="body2" color="text.secondary"
                  sx={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{item.body}</Typography>}
                <Typography variant="caption" color="text.secondary">{t('type.' + item.type)} · {age(item.createdAt, i18n.language)}</Typography>
              </>} />
            </ListItemButton>;
          })}
        </List> : <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{t('bell.empty')}</Typography>}
      <Divider />
      <Button fullWidth sx={{ minHeight: 44 }} onClick={() => { setAnchor(null); navigate('/notifications'); }}>{t('bell.viewAll')}</Button>
    </Popover>
  </>;
}

export default function NotificationBell() {
  const { currentBusiness, user } = useSession();
  const { t } = useTranslation('notifications');
  if (!currentBusiness || !user) return null;
  return <BellBoundary key={currentBusiness.id} fallback={
    <IconButton disabled aria-label={t('bell.title')}><NotificationsNoneOutlined /></IconButton>
  }><Bell userId={user.id} /></BellBoundary>;
}
