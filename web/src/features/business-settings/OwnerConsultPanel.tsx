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
  const [answers, setAnswers] = useState<string[]>([]);
  const [privateRationale, setPrivateRationale] = useState('');
  const [customerReady, setCustomerReady] = useState(false);
  const [allowDraft, setAllowDraft] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<OwnerConsultAnswerReceipt | null>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const submitting = useRef(false);

  const view = current.data;
  const prompts = view?.answerPrompts?.length ? view.answerPrompts : [view?.question ?? ''];
  const parts = prompts.map((_, index) => answers[index]?.trim() ?? '');
  const customerAnswer = parts.join('\n\n');
  const complete = customerReady && parts.every(Boolean) && customerAnswer.length <= 2000;

  async function submit(view: OwnerConsultView) {
    if (!complete || submitting.current) return;
    const reuse = allowDraft ? 'propose_draft' : 'case_only';
    const rationale = privateRationale.trim() || null;
    const fingerprint = JSON.stringify([view.actionStepId, view.version, parts, rationale, reuse]);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    submitting.current = true;
    setProblem(null);
    try {
      setRecorded(await mutation.run({
        actionStepId: view.actionStepId, expectedVersion: view.version,
        clientRequestId: request.current.id, answer: customerAnswer, answerParts: parts,
        privateRationale: rationale, customerReady: true, reuse,
      }));
    } catch (error) {
      const failure = apiFailure(error)?.error;
      const reason = failure?.details?.reason;
      setProblem(failure?.code === 'VERSION_CONFLICT' ? 'consult.changed'
        : reason === 'incomplete_owner_answer' ? 'consult.incomplete'
          : reason === 'owner_answer_language' ? 'consult.wrongLanguage' : 'consult.saveError');
      if (failure?.code === 'VERSION_CONFLICT') current.reload();
    } finally {
      submitting.current = false;
    }
  }

  function editPart(index: number, value: string) {
    setAnswers(prompts.map((_, part) => part === index ? value : answers[part] ?? ''));
    setCustomerReady(false);
  }

  const failure = current.error?.error.code;
  const unavailable = failure === 'NOT_FOUND' || failure === 'PERMISSION_DENIED' || failure === 'BUSINESS_INACTIVE';
  const resolved = recorded || view?.state === 'answered';
  const answerText = recorded ? customerAnswer : view?.answer;
  const noteText = recorded ? privateRationale.trim() : view?.privateRationale;

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
                {noteText && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {t('consult.privateRationale')} · {noteText}
                </Typography>}
                <Typography variant="body2">{t((recorded?.reuse ?? view.reuse) === 'propose_draft'
                  ? 'consult.savedDraftPermission' : 'consult.caseOnly')}</Typography>
              </>
              : <Stack component="form" spacing={2} onSubmit={(event) => { event.preventDefault(); void submit(view); }}>
                {problem && <Alert severity="error">{t(problem)}</Alert>}
                <Typography variant="body2">{t('consult.answerLanguage.' + view.language)}</Typography>
                {prompts.map((prompt, index) => (
                  <Stack key={index} spacing={0.5}>
                    {prompts.length > 1 && <Typography variant="body2">{prompt}</Typography>}
                    <TextField label={prompts.length === 1 ? t('consult.answer') : t('consult.answerPart', { count: index + 1 })}
                      multiline minRows={2} required fullWidth value={answers[index] ?? ''}
                      onChange={(event) => editPart(index, event.target.value)} disabled={mutation.running}
                      slotProps={{ htmlInput: { maxLength: 2000 } }} />
                  </Stack>
                ))}
                {customerAnswer.length > 2000 && <Alert severity="error">{t('consult.answerTooLong')}</Alert>}
                <FormControlLabel label={t('consult.customerReady')} control={
                  <Checkbox checked={customerReady} onChange={(_, checked) => setCustomerReady(checked)} disabled={mutation.running} />
                } />
                <TextField label={t('consult.privateRationale')} helperText={t('consult.privateHelp')}
                  multiline minRows={2} fullWidth value={privateRationale} disabled={mutation.running}
                  onChange={(event) => setPrivateRationale(event.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
                <FormControlLabel label={t('consult.allowDraft')} control={
                  <Checkbox checked={allowDraft} onChange={(_, checked) => setAllowDraft(checked)} disabled={mutation.running} />
                } />
                <Typography variant="body2" color="text.secondary">{t('consult.help')}</Typography>
                <Button type="submit" variant="contained" disabled={!complete || mutation.running}
                  sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>{t('consult.submit')}</Button>
              </Stack>}
          </Stack>}
    </SectionCard>
  );
}
