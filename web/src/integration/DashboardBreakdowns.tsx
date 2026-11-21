import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SectionCard } from '../core';
import { useNavigation } from '../core/layout/AppShell';

type Count = { key: string; count: number };

function counts(value: unknown, field: 'date' | 'channel'): Count[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(row => {
    if (!row || typeof row[field] !== 'string' || !Number.isSafeInteger(row.conversations) || row.conversations < 0) return [];
    if (field === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return [];
    return [{ key: row[field], count: row.conversations }];
  });
}

export function DashboardBreakdowns({ daily, channels, loading }: { daily: unknown; channels: unknown; loading: boolean }) {
  const { t, i18n } = useTranslation('integration');
  const { entries } = useNavigation();
  const dates = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const days = counts(daily, 'date').sort((a, b) => a.key.localeCompare(b.key));
  const groups = [
    { label: 'activity', rows: days.slice(-7), raw: daily, path: '/chat', action: 'common:workspace.openInbox',
      note: days.length > 7 ? 'dashboardLatestDays' : 'dashboardByDay',
      format: (key: string) => {
        const date = Date.parse(key + 'T00:00:00Z');
        return Number.isFinite(date) ? dates.format(date) : key;
      } },
    { label: 'channels', rows: counts(channels, 'channel').sort((a, b) => b.count - a.count), raw: channels,
      path: '/channels', action: 'dashboardViewChannels', note: 'dashboardByChannel',
      format: (key: string) => t('inbox:channel.' + key, { defaultValue: key }) },
  ];
  return <Box sx={{
    display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))',
  }}>
    {groups.map(group => {
      const max = Math.max(1, ...group.rows.map(row => row.count));
      const canOpen = entries.some(entry => entry.path === group.path);
      return <SectionCard key={group.label} title={t('tabs.' + group.label)}>
        <Stack spacing={1.5}>
          {loading ? <LinearProgress aria-label={t('common:pages.loading')} /> : group.rows.length ? <>
            <Typography variant="body2" color="text.secondary">{t(group.note)}</Typography>
            <Box component="dl" sx={{ m: 0 }}>
              {group.rows.map(row => <Box key={row.key} sx={{
                display: 'grid', alignItems: 'center', gap: 1.25, py: .65, gridTemplateColumns: 'minmax(56px, 6em) minmax(0, 1fr) auto',
              }}>
                <Typography variant="body2" component="dt">{group.format(row.key)}</Typography>
                <Box component="dd" sx={{ m: 0, gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <Box aria-hidden sx={{ flex: 1, bgcolor: 'primary.light', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                    <Box sx={{ width: (row.count / max * 100) + '%', height: '100%', bgcolor: 'primary.main', borderRadius: 'inherit' }} />
                  </Box>
                  <Typography variant="body2" component="span" sx={{ minWidth: '3ch', textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>
                    {row.count.toLocaleString(i18n.language)}
                  </Typography>
                </Box>
              </Box>)}
            </Box>
          </> : <Typography variant="body2" color="text.secondary">
            {t(Array.isArray(group.raw) && !group.raw.length ? 'dashboardNoCounts'
              : canOpen ? 'dashboardFallback.' + group.label : 'dashboardCountsUnavailable')}
          </Typography>}
          {canOpen && <Button component={Link} to={group.path} endIcon={<ArrowForwardOutlined />} sx={{ alignSelf: 'start' }}>
            {t(group.action)}
          </Button>}
        </Stack>
      </SectionCard>;
    })}
  </Box>;
}
