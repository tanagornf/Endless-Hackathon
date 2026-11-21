import { Alert, Button, Checkbox, FormControlLabel, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnswerOwnerConsultInput, OwnerConsultAnswerReceipt, OwnerConsultView } from '@nless/shared/features/business-settings/types';
import { EmptyState, SectionCard, useApiMutation, useApiQuery } from '../../core';
import { apiFailure } from './settings-errors';

type AnswerBody = Omit<AnswerOwnerConsultInput, 'caseId'>;

export default function OwnerConsultPanel({ caseId }: { caseId: string }) {
  const { t } = useTranslation('business-settings');
  const path = '/settings/owner-consults/' + encodeURIComponent(caseId);
  const current = useApiQuery<OwnerConsultView>(path);
  const mutation = useApiMutation<AnswerBody, OwnerConsultAnswerReceipt>('POST', path + '/answer', { toastOnError: false });
  const [answer, setAnswer] = useState('');
  const [allowDraft, setAllowDraft] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<OwnerConsultAnswerReceipt | null>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const submitting = useRef(false);

  async function submit(view: OwnerConsultView) {
    const text = answer.trim();
    if (!text || submitting.current) return;
    const reuse = allowDraft ? 'propose_draft' : 'case_only';
    const fingerprint = JSON.stringify([view.actionStepId, view.version, text, reuse]);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    submitting.current = true;
    setProblem(null);
    try {
      setRecorded(await mutation.run({
        actionStepId: view.actionStepId, expectedVersion: view.version,
        clientRequestId: request.current.id, answer: text, reuse,
      }));
    } catch (error) {
      const code = apiFailure(error)?.error.code;
      setProblem(code === 'VERSION_CONFLICT' ? 'consult.changed' : 'consult.saveError');
      if (code === 'VERSION_CONFLICT') current.reload();
    } finally {
      submitting.current = false;
    }
  }

  const failure = current.error?.error.code;
  const view = current.data;
  const unavailable = failure === 'NOT_FOUND' || failure === 'PERMISSION_DENIED' || failure === 'BUSINESS_INACTIVE';
  const resolved = recorded || view?.state === 'answered';
  const answerText = recorded ? answer.trim() : view?.answer;

  return (
    <SectionCard title={t('consult.title')}>
      {failure
        ? <EmptyState title={t(unavailable ? 'consult.unavailable' : 'consult.loadError')}
            action={unavailable ? undefined : <Button onClick={current.reload}>{t('settings.retry')}</Button>} />
        : !view
          ? <Skeleton aria-label={t('consult.loading')} />
          : <Stack spacing={2}>
            <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{view.question}</Typography>
            {resolved
              ? <>
                <Alert severity="success">{t('consult.saved')}</Alert>
                {answerText && <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{answerText}</Typography>}
                <Typography variant="body2">{t((recorded?.reuse ?? view.reuse) === 'propose_draft'
                  ? 'consult.savedDraftPermission' : 'consult.caseOnly')}</Typography>
              </>
              : <Stack component="form" spacing={2} onSubmit={(event) => { event.preventDefault(); void submit(view); }}>
                {problem && <Alert severity="error">{t(problem)}</Alert>}
                <TextField label={t('consult.answer')} multiline minRows={3} required fullWidth
                  value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={mutation.running}
                  slotProps={{ htmlInput: { maxLength: 2000 } }} />
                <FormControlLabel label={t('consult.allowDraft')} control={
                  <Checkbox checked={allowDraft} onChange={(_, checked) => setAllowDraft(checked)} disabled={mutation.running} />
                } />
                <Typography variant="body2" color="text.secondary">{t('consult.help')}</Typography>
                <Button type="submit" variant="contained" disabled={!answer.trim() || mutation.running}
                  sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>{t('consult.submit')}</Button>
              </Stack>}
          </Stack>}
    </SectionCard>
  );
}
