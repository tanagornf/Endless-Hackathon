import type { ImportView } from '@nless/shared/features/knowledge-import/types';
import { Alert, Button, Checkbox, FormControlLabel, Stack } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ConfirmDialog, useApiMutation } from '../../core';

export function ErrorDownload({ path }: { path: string }) {
  const { t } = useTranslation('knowledge-import');
  const base = import.meta.env.VITE_API_BASE || '/api/v1';
  return <Button component="a" href={base + api.biz(path + '/errors.csv')}>{t('actions.errors')}</Button>;
}

export default function ReviewActions({ record, path, canWrite, onCommit }: {
  record: ImportView; path: string; canWrite: boolean; onCommit: (record: ImportView) => void;
}) {
  const { t } = useTranslation('knowledge-import');
  const [allowed, setAllowed] = useState(false);
  const [foundDuplicate, setFoundDuplicate] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const duplicate = Boolean(record.duplicate) || foundDuplicate;
  const commit = useApiMutation<{ allowReimport: boolean }, ImportView>('POST', path + '/commit');

  async function submit() {
    try {
      onCommit(await commit.run({ allowReimport: allowed }));
    } catch (cause) {
      if ((cause as { details?: { reason?: string } }).details?.reason === 'already_imported') {
        setFoundDuplicate(true);
        setConfirm(false);
      }
      throw cause;
    }
  }

  return <Stack spacing={1} sx={{ mt: 2, alignItems: 'flex-start' }}>
    {foundDuplicate && !record.duplicate && <Alert severity="warning">{t('error.already_imported')}</Alert>}
    {duplicate && canWrite && <FormControlLabel label={t('review.allowReimport')}
      control={<Checkbox checked={allowed} onChange={(_, value) => setAllowed(value)} />} />}
    <Stack direction="row" spacing={1}>
      {canWrite && <Button color="primary" variant="contained" data-testid="import-commit"
        disabled={record.counts.ready === 0 || commit.running || (duplicate && !allowed)} onClick={() => setConfirm(true)}>
        {t('actions.commit')}
      </Button>}
      {record.counts.error > 0 && <ErrorDownload path={path} />}
    </Stack>
    {canWrite && <ConfirmDialog open={confirm} title={t('review.confirmTitle', { n: record.counts.ready })}
      message={t('review.confirmBody')} confirmLabel={t('actions.confirm')} onConfirm={submit} onClose={() => setConfirm(false)} />}
  </Stack>;
}
