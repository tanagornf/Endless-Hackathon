import { useId, useRef, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Button, MenuItem, Skeleton, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from 'react-i18next';
import type {
  ShopInstructionActivation, ShopInstructionReview, ShopInstructionVersion,
} from '@nless/shared/features/business-settings/shop-instructions-types';
import { ConfirmDialog, EmptyState, formatDateTime, SectionCard, useApiMutation, useApiQuery, useSession } from '../../core';
import ShopInstructionReviewComparison from './ShopInstructionReviewComparison';
import { apiFailure } from './settings-errors';

const endpoint = '/settings/shop-instructions';

type ReviewTarget = { kind: 'publish' | 'rollback'; id: string } | { kind: 'restoreBaseline' };
type ReviewAction = ShopInstructionActivation & ReviewTarget;

const actionText = {
  publish: {
    title: 'shopInstructions.confirmPublishTitle', message: 'shopInstructions.confirmPublishMessage',
    confirm: 'shopInstructions.confirmPublish', success: 'shopInstructions.published',
  },
  rollback: {
    title: 'shopInstructions.confirmRollbackTitle', message: 'shopInstructions.confirmRollbackMessage',
    confirm: 'shopInstructions.confirmRollback', success: 'shopInstructions.rolledBack',
  },
  restoreBaseline: {
    title: 'shopInstructions.confirmBaselineTitle', message: 'shopInstructions.confirmBaselineMessage',
    confirm: 'shopInstructions.restoreBaseline', success: 'shopInstructions.baselineRestored',
  },
} as const;

type ReviewIssue = 'shopInstructions.conflict' | 'shopInstructions.replayPending';
type ReviewNotice = typeof actionText[keyof typeof actionText]['success'] | ReviewIssue;

export default function ShopInstructionReviewPanel() {
  const { currentBusiness, businesses } = useSession();
  const membership = businesses.find(({ business }) => business.id === currentBusiness?.id);
  return membership?.role === 'owner' ? <InstructionReview key={membership.business.id} /> : null;
}

function InstructionReview() {
  const { t } = useTranslation('business-settings');
  const query = useApiQuery<ShopInstructionReview>(endpoint);
  const [selectedId, setSelectedId] = useState<string>();
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [notice, setNotice] = useState<ReviewNotice | null>(null);
  const [saveError, setSaveError] = useState(false);
  const submitting = useRef(false);
  const historyId = useId();
  const actionPath = action ? actionEndpoint(action) : endpoint;
  const mutation = useApiMutation<ShopInstructionActivation, ShopInstructionVersion>(
    'POST', actionPath, { toastOnError: false },
  );

  const view = query.data;
  const active = view?.versions.find(({ id }) => id === view.activeVersionId);
  const candidate = view?.candidates.find(({ id }) => id === selectedId) ?? view?.candidates[0];
  const stale = Boolean(view && candidate && candidate.baseVersionId !== view.activeVersionId);
  const replayPending = Boolean(candidate && !candidate.replayPassed);
  const confirmation = action && actionText[action.kind];

  function choose(target: ReviewTarget) {
    if (!view || submitting.current) return;
    setNotice(null);
    setSaveError(false);
    setAction({ ...target, expectedActiveVersionId: view.activeVersionId });
  }

  function refreshBlocked(issue: ReviewIssue) {
    setNotice(issue);
    setAction(null);
    query.reload();
  }

  async function confirm() {
    if (!action || submitting.current) return;
    if (!view || view.activeVersionId !== action.expectedActiveVersionId) {
      refreshBlocked('shopInstructions.conflict');
      return;
    }
    if (action.kind === 'publish' && !view.candidates.find(({ id }) => id === action.id)?.replayPassed) {
      refreshBlocked('shopInstructions.replayPending');
      return;
    }

    submitting.current = true;
    setSaveError(false);
    try {
      await mutation.run({ expectedActiveVersionId: action.expectedActiveVersionId });
      setNotice(actionText[action.kind].success);
      setAction(null);
      query.reload();
    } catch (error) {
      const code = apiFailure(error)?.error.code;
      if (code === 'VERSION_CONFLICT') {
        refreshBlocked('shopInstructions.conflict');
      } else if (code === 'POLICY_BLOCKED' && action.kind === 'publish') {
        refreshBlocked('shopInstructions.replayPending');
      } else {
        setSaveError(true);
        throw error;
      }
    } finally {
      submitting.current = false;
    }
  }

  return (
    <SectionCard title={t('shopInstructions.title')}>
      <Stack spacing={2}>
        {notice && !(notice === 'shopInstructions.replayPending' && replayPending) && <Alert
          severity={notice === 'shopInstructions.conflict' || notice === 'shopInstructions.replayPending' ? 'warning' : 'success'}>
          {t(notice)}
        </Alert>}
        {query.error && <EmptyState title={t('shopInstructions.loadError')}
          action={<Button onClick={query.reload}>{t('settings.retry')}</Button>} />}
        {!view && !query.error && <Stack role="status" aria-label={t('shopInstructions.loading')}>
          <Skeleton variant="rounded" height={140} />
        </Stack>}
        {view && <>
          {view.candidates.length > 1 && <TextField select label={t('shopInstructions.selectCandidate')}
            value={candidate?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)} disabled={mutation.running}>
            {view.candidates.map(({ id }) => <MenuItem key={id} value={id} sx={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
              {t('shopInstructions.candidateId', { id })}
            </MenuItem>)}
          </TextField>}
          <ShopInstructionReviewComparison
            current={active ? { ...active, versionLabel: t('shopInstructions.versionId', { id: active.id }) } : null}
            proposed={candidate && { ...candidate, versionLabel: t('shopInstructions.candidateId', { id: candidate.id }) }}
          />
          {candidate ? <Stack spacing={1}>
            {candidate.reason && <Typography variant="body2" dir="auto" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {t('shopInstructions.reason', { reason: candidate.reason })}
            </Typography>}
            {stale && <Alert severity="warning">{t('shopInstructions.staleCandidate')}</Alert>}
            {replayPending && <Alert severity="warning">{t('shopInstructions.replayPending')}</Alert>}
            <Button variant="contained" disabled={stale || replayPending || mutation.running}
              onClick={() => choose({ kind: 'publish', id: candidate.id })}
              sx={{ minHeight: 44, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
              {t('shopInstructions.publish')}
            </Button>
            {replayPending && <Button onClick={() => { setNotice(null); query.reload(); }}
              sx={{ minHeight: 44, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
              {t('shopInstructions.refreshReplay')}
            </Button>}
          </Stack> : <EmptyState title={t('shopInstructions.noCandidates')} />}
          <Stack spacing={1}>
            <Typography component="h3" variant="h6">{t('shopInstructions.history')}</Typography>
            {view.versions.length === 0 && <Typography color="text.secondary">{t('shopInstructions.noHistory')}</Typography>}
            {view.versions.map((version) => {
              const isActive = version.id === view.activeVersionId;
              const id = `${historyId}-${version.id}`;
              return (
                <Accordion key={version.id} disableGutters variant="outlined" slotProps={{ transition: { unmountOnExit: true } }}>
                  <AccordionSummary id={`${id}-heading`} aria-controls={`${id}-details`} expandIcon={<ExpandMoreIcon />}>
                    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                        {t('shopInstructions.versionId', { id: version.id })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(version.createdAt)}{isActive && ` · ${t('shopInstructions.active')}`}
                      </Typography>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1.5}>
                      {version.restoredFromVersionId && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                        {t('shopInstructions.restoredFrom', { id: version.restoredFromVersionId })}
                      </Typography>}
                      {version.instruction === null
                        ? <Typography color="text.secondary">{t('shopInstructions.baselineVersion')}</Typography>
                        : <Typography dir="auto" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{version.instruction}</Typography>}
                      {!isActive && version.instruction !== null && view.activeVersionId && <Button variant="outlined" disabled={mutation.running}
                        sx={{ minHeight: 44, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                        onClick={() => choose({ kind: 'rollback', id: version.id })}>{t('shopInstructions.rollback')}</Button>}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              );
            })}
            {active && active.instruction !== null && <Button variant="outlined" disabled={mutation.running}
              sx={{ minHeight: 44, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
              onClick={() => choose({ kind: 'restoreBaseline' })}>{t('shopInstructions.restoreBaseline')}</Button>}
          </Stack>
        </>}
      </Stack>
      {action && confirmation && <ConfirmDialog open danger={action.kind !== 'publish'}
        title={t(confirmation.title)}
        message={<Stack spacing={2} sx={{ overflowWrap: 'anywhere' }}>
          <Typography>{'id' in action ? t(confirmation.message, { id: action.id }) : t(confirmation.message)}</Typography>
          {saveError && <Alert severity="error">{t('shopInstructions.saveError')}</Alert>}
        </Stack>}
        confirmLabel={t(confirmation.confirm)}
        onClose={() => setAction(null)} onConfirm={confirm} />}
    </SectionCard>
  );
}

function actionEndpoint(action: ReviewAction) {
  if (action.kind === 'restoreBaseline') return `${endpoint}/versions/baseline/rollback`;
  const collection = action.kind === 'publish' ? 'candidates' : 'versions';
  return `${endpoint}/${collection}/${encodeURIComponent(action.id)}/${action.kind}`;
}
