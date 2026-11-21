import { Alert, Button, LinearProgress, Link as ExternalLink, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { KnowledgeItemDetail } from '@nless/shared/features/knowledge/types';
import {
  ConfirmDialog, EmptyState, PageHeader, SectionCard, StatusChip, useApiMutation, useApiQuery, useCan,
  useRealtime, useSession, useToast,
} from '../../core';
import type { FolderList } from './FolderManager';

type Fields = Pick<KnowledgeItemDetail, 'kind' | 'title' | 'body' | 'folderId'>;
type Draft = Fields & { expectedRevision: number };
type Expected = { expectedRevision: number };
type Transition = 'submit' | 'activate' | 'deactivate' | 'reindex';

function Editor({ id }: { id: string }) {
  const { t } = useTranslation('knowledge');
  const navigate = useNavigate();
  const toast = useToast();
  const { currentBusiness, businesses } = useSession();
  const isOwner = businesses.some(({ business, role }) => business.id === currentBusiness?.id && role === 'owner');
  const canWrite = useCan('product.write');
  const canDelete = useCan('product.delete');
  const path = '/knowledge/items/' + id;
  const query = useApiQuery<KnowledgeItemDetail>(path);
  const folders = useApiQuery<FolderList>('/knowledge/folders');
  const patch = useApiMutation<Draft, KnowledgeItemDetail>('PATCH', path, { toastOnError: false });
  const submit = useApiMutation<Expected, KnowledgeItemDetail>('POST', path + '/submit', { toastOnError: false });
  const activate = useApiMutation<Expected & { acknowledgeModeration: boolean }, KnowledgeItemDetail>('POST', path + '/activate', { toastOnError: false });
  const deactivate = useApiMutation<Expected, KnowledgeItemDetail>('POST', path + '/deactivate', { toastOnError: false });
  const reindex = useApiMutation<Record<string, never>, KnowledgeItemDetail>('POST', path + '/reindex', { toastOnError: false });
  const remove = useApiMutation<void, unknown>('DELETE', path);
  const reject = useApiMutation<Expected, unknown>('POST', path + '/reject', { toastOnError: false });
  const [item, setItem] = useState<KnowledgeItemDetail>();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmation, setConfirmation] = useState<'activate' | 'delete' | 'leave' | 'reject' | null>(null);
  const [ownerApproval, setOwnerApproval] = useState<{ revision: number; flagged: boolean } | null>(null);
  const received = query.data;
  useEffect(() => { if (received) setItem(received); }, [received]);
  useRealtime('knowledge.status', (event) => { if (event.knowledgeItemId === id) query.reload(); });
  const waiting = item && item.status !== 'draft' && item.status !== 'deleted' &&
    (item.indexState === 'indexing' || item.indexState === 'not_started');
  const reload = query.reload;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(reload, 2500);
    return () => clearInterval(timer);
  }, [waiting, reload]);

  const dirty = !!(draft && item && (draft.kind !== item.kind || draft.title !== item.title || draft.body !== item.body || draft.folderId !== item.folderId));
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const goBack = useCallback(() => {
    if (dirty) setConfirmation('leave');
    else navigate('/knowledge');
  }, [dirty, navigate]);

  function showError(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    const details = error && typeof error === 'object' && 'details' in error ? error.details : null;
    if (code === 'VERSION_CONFLICT') {
      setConflict(true);
      toast.error(t('error.conflict'));
    } else if (code === 'KNOWLEDGE_NOT_READY') {
      toast.error(t('error.notReady'));
      reload();
    } else if (code === 'POLICY_BLOCKED' && details && typeof details === 'object' &&
        'reason' in details && details.reason === 'owner_consult_consent') {
      toast.error(t('ownerConsult.consentUnavailable'));
    } else {
      toast.error(typeof code === 'string' ? t('common:errors.' + code, { defaultValue: t('common:errors.generic') }) : t('common:errors.generic'));
    }
  }
  async function save() {
    if (!draft || !dirty || patch.running) return;
    try {
      setItem(await patch.run(draft));
      setDraft(null);
      setConflict(false);
      toast.success(t('toast.saved'));
      reload();
    } catch (error) { showError(error); }
  }
  async function transition(action: Transition, approval?: { revision: number; flagged: boolean }) {
    if (!item || dirty) return;
    const input = { expectedRevision: approval?.revision ?? item.revision };
    try {
      let updated: KnowledgeItemDetail;
      switch (action) {
        case 'submit': updated = await submit.run(input); break;
        case 'activate': updated = await activate.run({ ...input, acknowledgeModeration: approval?.flagged ?? confirmation === 'activate' }); break;
        case 'deactivate': updated = await deactivate.run(input); break;
        case 'reindex': updated = await reindex.run({}); break;
      }
      setItem(updated);
      toast.success(t('toast.' + action));
      reload();
    } catch (error) { showError(error); throw error; }
  }
  const retry = <Button onClick={reload}>{t('common:actions.retry')}</Button>;
  if (!item) return query.error
    ? <EmptyState title={t('error.load')} action={retry} />
    : <LinearProgress />;

  const fields: Fields = draft ?? item;
  const editable = canWrite && item.mutable;
  const webSuggestion = item.webSuggestion;
  const ownerConsult = item.source === 'owner-consult';
  const explicitApproval = !!webSuggestion || ownerConsult;
  const pendingSuggestion = !!webSuggestion && (item.status === 'draft' || item.status === 'reviewed');
  const canEditContent = editable && !(explicitApproval && item.status === 'active');
  const busy = patch.running || submit.running || activate.running || deactivate.running || reindex.running || remove.running || reject.running;
  function update(change: Partial<Fields>) {
    setDraft((current) => ({ kind: item!.kind, title: item!.title, body: item!.body, folderId: item!.folderId,
      expectedRevision: item!.revision, ...current, ...change }));
  }
  const action = item.status === 'draft' && !explicitApproval ? 'submit' : item.status === 'active' ? 'deactivate' : 'activate';
  const ownerActivation = ownerConsult && action === 'activate';
  const actionLabel = t(ownerActivation ? 'ownerConsult.approve' : webSuggestion && action === 'activate' ? 'web.activate' : 'actions.' + action);
  const missingContent = !fields.title.trim() || !fields.body.trim();
  const requiresContent = action === 'submit' || (explicitApproval && action === 'activate');
  const requiresIndex = action === 'activate' && !explicitApproval;
  function handleTransition() {
    if (ownerActivation && item) setOwnerApproval({ revision: item.revision, flagged: item.moderation?.status === 'flagged' });
    else if (action === 'activate' && item?.moderation?.status === 'flagged') setConfirmation('activate');
    else void transition(action).catch(() => {});
  }
  return <>
    <PageHeader title={item.title || t('page.untitled')} actions={<Button onClick={goBack}>{t('actions.back')}</Button>} />
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <StatusChip status={item.status} />
        <StatusChip status={item.indexState} />
        <span>{t('page.revision', { n: item.revision })}</span>
      </Stack>
      {query.error && <Alert severity="error" action={retry}>{t('error.load')}</Alert>}
      {conflict && <Alert severity="warning" action={<Button onClick={() => {
        setDraft(null); setConflict(false); reload();
      }}>{t('actions.reload')}</Button>}>{t('error.conflict')}</Alert>}
      {item.moderation?.status === 'flagged' && <Alert severity="warning">{t('moderation.flagged')}</Alert>}
      {item.warnings.map((warning) => <Alert severity="info" key={warning.code + warning.itemId}>
        {t('warn.' + warning.code)}{' '}
        <Button component={Link} to={'/knowledge/' + warning.itemId} disabled={dirty}>{warning.title}</Button>
      </Alert>)}
      {item.mutable && waiting && <Alert severity="info">
        {t(item.status === 'active' ? webSuggestion ? 'web.indexing' : 'index.pendingRevision' : 'index.indexing')}
      </Alert>}
      {item.indexState === 'failed' && <Alert severity="warning">{t('index.failed')}</Alert>}
      {ownerConsult && <Alert severity="info">
        {t(item.status === 'active' ? 'ownerConsult.active' : 'ownerConsult.pending')}
      </Alert>}
      {webSuggestion && <SectionCard>
        <Stack spacing={1} sx={{ overflowWrap: 'anywhere' }}>
          <Typography variant="h6">{t(pendingSuggestion ? 'web.pending' : 'web.label')}</Typography>
          <Typography variant="body2">{webSuggestion.question}</Typography>
          <Typography variant="subtitle2">{t('web.sources')}</Typography>
          <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 3 }}>
            {webSuggestion.citations.map(({ url, title }) => <li key={url}>
              <ExternalLink href={url} target="_blank" rel="noopener noreferrer">{title}</ExternalLink>
            </li>)}
          </Stack>
          {item.status === 'active' && canWrite && <Typography variant="body2" color="text.secondary">{t('web.editActive')}</Typography>}
        </Stack>
      </SectionCard>}
      <SectionCard>
        <Stack spacing={2}>
          <TextField select label={t('table.kind')} value={fields.kind} disabled={!canEditContent || busy}
            onChange={(event) => update({ kind: event.target.value as Fields['kind'] })}>
            <MenuItem value="faq">{t('kind.faq')}</MenuItem>
            <MenuItem value="article">{t('kind.article')}</MenuItem>
          </TextField>
          <TextField label={t(fields.kind === 'faq' ? 'form.question' : 'form.title')} value={fields.title}
            onChange={(event) => update({ title: event.target.value })}
            slotProps={{ input: { readOnly: !canEditContent || busy }, htmlInput: { maxLength: 255 } }} />
          <TextField multiline minRows={6} label={t(fields.kind === 'faq' ? 'form.answer' : 'form.body')} value={fields.body}
            helperText={t('form.count', { n: fields.body.length })}
            onChange={(event) => update({ body: event.target.value })}
            slotProps={{ input: { readOnly: !canEditContent || busy }, htmlInput: { maxLength: 20000 } }} />

          <TextField select label={t('filter.folder')} value={fields.folderId ?? ''} disabled={!editable || busy || !!folders.error}
            onChange={(event) => update({ folderId: event.target.value || null })}>
            <MenuItem value="">{t('table.unfiled')}</MenuItem>
            {fields.folderId && !folders.data?.items.some((folder) => folder.id === fields.folderId) &&
              <MenuItem value={fields.folderId}>{item.folderName ?? t('table.unfiled')}</MenuItem>}
            {folders.data?.items.map((folder) => <MenuItem key={folder.id} value={folder.id}>{folder.name}</MenuItem>)}
          </TextField>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {editable && <>
              <Button variant="contained" disabled={busy || !dirty} onClick={() => void save()}>{t('actions.save')}</Button>
              {(!ownerActivation || isOwner) && <Button variant="outlined" disabled={busy || dirty || (requiresContent && missingContent) ||
                (requiresIndex && item.indexState !== 'ready')} onClick={handleTransition}>{actionLabel}</Button>}
              {item.status !== 'draft' && (!ownerConsult || item.status === 'active') &&
                (item.indexState === 'failed' || item.indexState === 'not_started') &&
                <Button disabled={busy || dirty} onClick={() => void transition('reindex').catch(() => {})}>{t('actions.reindex')}</Button>}
            </>}
            {pendingSuggestion && editable && <Button color="error" disabled={busy} onClick={() => setConfirmation('reject')}>{t('web.reject')}</Button>}
            {!pendingSuggestion && canDelete && item.mutable &&
              <Button color="error" disabled={busy} onClick={() => setConfirmation('delete')}>{t('actions.delete')}</Button>}
          </Stack>
        </Stack>
      </SectionCard>
    </Stack>
    <ConfirmDialog open={confirmation === 'delete'} title={t('confirm.deleteTitle')} message={t('confirm.deleteMessage')}
      confirmLabel={t('actions.delete')} danger onClose={() => setConfirmation(null)} onConfirm={async () => {
        await remove.run();
        toast.success(t('toast.deleted'));
        navigate('/knowledge');
      }} />
    <ConfirmDialog open={confirmation === 'activate'} title={t('moderation.confirmTitle')} message={t('moderation.confirmMessage')}
      confirmLabel={actionLabel} onClose={() => setConfirmation(null)} onConfirm={() => transition('activate')} />
    <ConfirmDialog open={ownerApproval !== null} title={t('ownerConsult.approveTitle')}
      message={<Stack spacing={1}>
        <Typography>{t('ownerConsult.approveMessage', { revision: ownerApproval?.revision })}</Typography>
        {ownerApproval?.flagged && <Typography>{t('moderation.confirmMessage')}</Typography>}
      </Stack>} confirmLabel={t('ownerConsult.approve')} onClose={() => setOwnerApproval(null)} onConfirm={async () => {
        if (ownerApproval) await transition('activate', ownerApproval);
      }} />
    <ConfirmDialog open={confirmation === 'reject'} title={t('web.reject')} message={t('web.rejectMessage')}
      confirmLabel={t('web.reject')} danger onClose={() => setConfirmation(null)} onConfirm={async () => {
        try {
          await reject.run({ expectedRevision: item.revision });
          toast.success(t('web.rejected'));
          navigate('/knowledge');
        } catch (error) { showError(error); throw error; }
      }} />
    <ConfirmDialog open={confirmation === 'leave'} title={t('form.unsaved')} message={t('form.unsavedMessage')} confirmLabel={t('actions.leave')}
      onClose={() => setConfirmation(null)} onConfirm={() => navigate('/knowledge')} />
  </>;
}

export default function KnowledgeEditPage() {
  const { itemId } = useParams();
  const businessId = useSession().currentBusiness?.id;
  return businessId && itemId ? <Editor key={businessId + ':' + itemId} id={itemId} /> : null;
}
