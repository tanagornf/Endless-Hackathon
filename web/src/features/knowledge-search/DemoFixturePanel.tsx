import { Alert, Button, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { JobState } from '@nless/shared/core/types';
import { ConfirmDialog, SectionCard, useApiMutation, useRealtime } from '../../core';

type FixtureJob = { id: string; state: JobState; progress?: { done: number; total: number } };

export default function DemoFixturePanel() {
  const { t } = useTranslation('knowledge-search');
  const load = useApiMutation<void, { jobId: string }>('POST', '/knowledge-search/fixture/load', { toastOnError: false });
  const remove = useApiMutation<void, { removed: number }>('POST', '/knowledge-search/fixture/remove', { toastOnError: false });
  const [job, setJob] = useState<FixtureJob | null>(null);
  const [confirm, setConfirm] = useState<'load' | 'remove' | null>(null);
  const [removed, setRemoved] = useState<number | null>(null);
  const [error, setError] = useState(false);
  useRealtime('job.updated', (event) => {
    setJob((current) => current?.id === event.jobId ? {
      id: event.jobId, state: event.state, progress: event.progress ?? current.progress,
    } : current);
  });
  const busy = load.running || remove.running;
  async function apply() {
    if (!confirm) return;
    setError(false);
    setRemoved(null);
    try {
      if (confirm === 'load') {
        const { jobId } = await load.run();
        setJob((current) => current?.id === jobId ? current : { id: jobId, state: 'queued' });
      } else {
        const result = await remove.run();
        setJob(null);
        setRemoved(result.removed);
      }
    } catch {
      setError(true);
    } finally {
      setConfirm(null);
    }
  }
  return <SectionCard title={t('fixture.title')}>
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="outlined" disabled={busy} onClick={() => setConfirm('load')}>{t('fixture.load')}</Button>
        <Button color="error" disabled={busy} onClick={() => setConfirm('remove')}>{t('fixture.remove')}</Button>
      </Stack>
      {(job?.state === 'queued' || job?.state === 'running') && <Typography>{job.progress
        ? t('fixture.progress', job.progress) : t(job.state === 'queued' ? 'fixture.queued' : 'fixture.loading')}</Typography>}
      {job?.state === 'succeeded' && <Alert severity="success">{t('fixture.ready')}</Alert>}
      {job?.state === 'cancelled' && <Alert severity="info">{t('fixture.cancelled')}</Alert>}
      {(error || job?.state === 'failed' || job?.state === 'dead') && <Alert severity="error">{t('fixture.error')}</Alert>}
      {removed !== null && <Alert severity="success">{t('fixture.removed', { count: removed })}</Alert>}
    </Stack>
    <ConfirmDialog open={confirm !== null} title={t(confirm === 'remove' ? 'fixture.remove' : 'fixture.load')}
      message={t(confirm === 'remove' ? 'fixture.confirmRemove' : 'fixture.confirmLoad')}
      confirmLabel={t(confirm === 'remove' ? 'fixture.remove' : 'fixture.load')} danger={confirm === 'remove'}
      onClose={() => setConfirm(null)} onConfirm={apply} />
  </SectionCard>;
}
