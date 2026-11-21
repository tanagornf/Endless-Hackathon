import { useState } from 'react';
import { Alert, Autocomplete, Button, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { CrmCustomerDetail, CustomerPanelData } from '@nless/shared/features/crm/types';
import { SectionCard, StatusChip, formatDateTime, useApiMutation, useApiQuery, useRealtime } from '../../core';

export function ProfileCard({ detail, availableTags, canEditTags, canCreateTags, onChange, link = false }:
  Pick<CustomerPanelData, 'detail' | 'availableTags' | 'canEditTags' | 'canCreateTags'> & { onChange: () => void; link?: boolean }) {
  const { t } = useTranslation('crm');
  const [input, setInput] = useState('');
  const path = '/crm/customers/' + encodeURIComponent(detail.id) + '/tags';
  const attach = useApiMutation<{ tagId: string } | { name: string }, CrmCustomerDetail>('POST', path);
  const detach = useApiMutation<{ id: string }, CrmCustomerDetail>('DELETE', v => path + '/' + encodeURIComponent(v.id));
  const selected = new Set(detail.tags.map(tag => tag.id));
  const options = availableTags.filter(tag => !selected.has(tag.id)).map(({ id, name }) => ({ id, name }));
  const trimmed = input.trim();
  const create = canCreateTags && trimmed && !availableTags.some(tag => tag.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  if (create) options.push({ id: '', name: trimmed });
  const apply = async (option: { id: string; name: string } | null) => {
    if (!option) return;
    try {
      await attach.run(option.id ? { tagId: option.id } : { name: option.name });
      setInput(''); onChange();
    } catch { /* mutation hook displays the localized failure */ }
  };
  return <SectionCard title={t('panel.title')}>
    <Stack data-testid="crm-panel" spacing={1.5} sx={{ minWidth: 0 }}>
      <Typography variant="subtitle1" sx={{ overflowWrap: 'anywhere' }}>{detail.displayName || t('customer')}</Typography>
      <Typography variant="body2">{t('channels.' + detail.channel)} · {detail.externalIdMasked}</Typography>
      {detail.firstSeenAt && <Typography variant="caption">{t('firstSeen', { date: formatDateTime(detail.firstSeenAt) })}</Typography>}
      {detail.lastSeenAt && <Typography variant="caption">{t('lastSeen', { date: formatDateTime(detail.lastSeenAt) })}</Typography>}
      <div data-testid="crm-consent-chip"><StatusChip status={detail.marketingConsent} label={t('consents.' + detail.marketingConsent)} /></div>
      <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
        {detail.tags.map(tag => <Chip key={tag.id} data-testid="crm-tag-chip" label={tag.name} title={t('sources.' + tag.source)}
          variant={tag.source === 'manual' ? 'filled' : 'outlined'} disabled={detach.running}
          onDelete={canEditTags ? () => void detach.run({ id: tag.id }).then(onChange).catch(() => { }) : undefined} />)}
      </Stack>
      {canEditTags && <Autocomplete options={options} value={null} inputValue={input}
        onInputChange={(_event, text, reason) => { if (reason === 'input' || reason === 'clear') setInput(text); }}
        openText={t('openTags')} closeText={t('closeTags')} clearText={t('clear')} onChange={(_event, option) => void apply(option)} disabled={attach.running || detach.running}
        getOptionLabel={option => option.id ? option.name : t('createNamed', { name: option.name })}
        noOptionsText={t('noTags')} renderInput={params => <TextField {...params} label={t('addTag')}
          slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, 'data-testid': 'crm-tag-add' } }} />} />}
      {link && <Button component={Link} to={'/customers/' + detail.id} sx={{ minHeight: 44 }}>{t('openProfile')}</Button>}
    </Stack>
  </SectionCard>;
}

export default function CustomerPanel({ conversationId }: Record<string, unknown>) {
  const { t } = useTranslation('crm');
  const state = useApiQuery<CustomerPanelData>(typeof conversationId === 'string' ? '/crm/conversations/' + encodeURIComponent(conversationId) + '/panel' : null);
  useRealtime('custom', event => { if (event.featureId === 'F24') state.reload(); });
  if (state.error) return <Alert severity="error" action={<Button onClick={state.reload}>{t('retry')}</Button>}>{t('loadError')}</Alert>;
  if (!state.data) return <CircularProgress size={22} aria-label={t('loading')} />;
  return <ProfileCard key={state.data.customerId} {...state.data} onChange={state.reload} link />;
}
