import { useId, useRef, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Button, MenuItem, Skeleton, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from 'react-i18next';
import type { ShopInstructionCandidate, ShopInstructionVersion } from '@nless/shared/features/business-settings/shop-instructions-types';
import { ConfirmDialog, EmptyState, formatDateTime, SectionCard, useApiMutation, useApiQuery, useSession } from '../../core';
import ShopInstructionReviewComparison from './ShopInstructionReviewComparison';
import { apiFailure } from './settings-errors';

const endpoint = '/settings/shop-instructions';

interface InstructionReviewView {
  activeVersionId: string | null;
  candidates: ShopInstructionCandidate[];
  versions: ShopInstructionVersion[];
}

type ReviewAction = {
  kind: 'publish' | 'rollback';
  id: string;
  expectedActiveVersionId: string | null;
};

export default function ShopInstructionReviewPanel() {
  const { currentBusiness, businesses } = useSession();
  const membership = businesses.find(({ business }) => business.id === currentBusiness?.id);
  return membership?.role === 'owner' ? <InstructionReview key={membership.business.id} /> : null;
}

function InstructionReview() {
  const { t } = useTranslation('business-settings');
  const query = useApiQuery<InstructionReviewView>(endpoint);
  const [selectedId, setSelectedId] = useState<string>();
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [notice, setNotice] = useState<'published' | 'rolledBack' | 'conflict' | null>(null);
  const [saveError, setSaveError] = useState(false);
  const submitting = useRef(false);
  const historyId = useId();
  const actionPath = action ? actionEndpoint(action) : endpoint;
  const mutation = useApiMutation<{ expectedActiveVersionId: string | null }, ShopInstructionVersion>(
    'POST', actionPath, { toastOnError: false },
  );

  const view = query.data;
  const active = view?.versions.find(({ id }) => id === view.activeVersionId);
  const candidate = view?.candidates.find(({ id }) => id === selectedId) ?? view?.candidates[0];
  const stale = Boolean(view && candidate && candidate.baseVersionId !== view.activeVersionId);

  function choose(kind: ReviewAction['kind'], id: string) {
    if (!view || submitting.current) return;
    setNotice(null);
    setSaveError(false);
    setAction({ kind, id, expectedActiveVersionId: view.activeVersionId });
  }

  function refreshConflict() {
    setNotice('conflict');
    setAction(null);
    query.reload();
  }

  async function confirm() {
    if (!action || submitting.current) return;
    if (!view || view.activeVersionId !== action.expectedActiveVersionId) {
      refreshConflict();
      return;
    }

    submitting.current = true;
    setSaveError(false);
    try {
      await mutation.run({ expectedActiveVersionId: action.expectedActiveVersionId });
      setNotice(action.kind === 'publish' ? 'published' : 'rolledBack');
      setAction(null);
      query.reload();
    } catch (error) {
      if (apiFailure(error)?.error.code === 'VERSION_CONFLICT') {
        refreshConflict();
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
        {notice && <Alert severity={notice === 'conflict' ? 'warning' : 'success'}>
          {t(`shopInstructions.${notice}`)}
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
            <Button variant="contained" disabled={stale || mutation.running} onClick={() => choose('publish', candidate.id)}
              sx={{ minHeight: 44, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
              {t('shopInstructions.publish')}
            </Button>
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
                      <Typography dir="auto" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{version.instruction}</Typography>
                      {!isActive && view.activeVersionId && <Button variant="outlined" disabled={mutation.running}
                        sx={{ minHeight: 44, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                        onClick={() => choose('rollback', version.id)}>{t('shopInstructions.rollback')}</Button>}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Stack>
        </>}
      </Stack>
      {action && <ConfirmDialog open danger={action.kind === 'rollback'}
        title={t(action.kind === 'publish' ? 'shopInstructions.confirmPublishTitle' : 'shopInstructions.confirmRollbackTitle')}
        message={<Stack spacing={2} sx={{ overflowWrap: 'anywhere' }}>
          <Typography>{t(action.kind === 'publish' ? 'shopInstructions.confirmPublishMessage' : 'shopInstructions.confirmRollbackMessage', { id: action.id })}</Typography>
          {saveError && <Alert severity="error">{t('shopInstructions.saveError')}</Alert>}
        </Stack>}
        confirmLabel={t(action.kind === 'publish' ? 'shopInstructions.confirmPublish' : 'shopInstructions.confirmRollback')}
        onClose={() => setAction(null)} onConfirm={confirm} />}
    </SectionCard>
  );
}

function actionEndpoint({ kind, id }: ReviewAction) {
  const collection = kind === 'publish' ? 'candidates' : 'versions';
  return `${endpoint}/${collection}/${encodeURIComponent(id)}/${kind}`;
}
