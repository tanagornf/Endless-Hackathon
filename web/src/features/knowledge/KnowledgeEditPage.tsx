import { Alert, Button, LinearProgress, MenuItem, Stack, TextField } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { KnowledgeItemDetail } from '@nless/shared/features/knowledge/types';
import {
  ConfirmDialog, EmptyState, PageHeader, SectionCard, StatusChip, useApiMutation, useApiQuery, useCan,
  useRealtime, useSession, useToast,
} from '../../core';

type Fields = Pick<KnowledgeItemDetail, 'kind' | 'title' | 'body'>;
type Draft = Fields & { expectedRevision: number };
type Expected = { expectedRevision: number };
type Transition = 'submit' | 'activate' | 'deactivate' | 'reindex';

function Editor({ id }: { id: string }) {
  const { t } = useTranslation('knowledge');
  const navigate = useNavigate();
  const toast = useToast();
  const canWrite = useCan('product.write');
  const canDelete = useCan('product.delete');
  const path = '/knowledge/items/' + id;
  const query = useApiQuery<KnowledgeItemDetail>(path);
  const patch = useApiMutation<Draft, KnowledgeItemDetail>('PATCH', path, { toastOnError: false });
  const submit = useApiMutation<Expected, KnowledgeItemDetail>('POST', path + '/submit', { toastOnError: false });
  const activate = useApiMutation<Expected & { acknowledgeModeration: boolean }, KnowledgeItemDetail>('POST', path + '/activate', { toastOnError: false });
  const deactivate = useApiMutation<Expected, KnowledgeItemDetail>('POST', path + '/deactivate', { toastOnError: false });
  const reindex = useApiMutation<Record<string, never>, KnowledgeItemDetail>('POST', path + '/reindex', { toastOnError: false });
  const remove = useApiMutation<void, unknown>('DELETE', path);
  const [item, setItem] = useState<KnowledgeItemDetail>();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmation, setConfirmation] = useState<'activate' | 'delete' | 'leave' | null>(null);
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

  const dirty = !!(draft && item && (draft.kind !== item.kind || draft.title !== item.title || draft.body !== item.body));
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
    if (code === 'VERSION_CONFLICT') {
      setConflict(true);
      toast.error(t('error.conflict'));
    } else if (code === 'KNOWLEDGE_NOT_READY') {
      toast.error(t('error.notReady'));
      reload();
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
  async function transition(action: Transition) {
    if (!item || dirty) return;
    const input = { expectedRevision: item.revision };
    try {
      let updated: KnowledgeItemDetail;
      switch (action) {
        case 'submit': updated = await submit.run(input); break;
        case 'activate': updated = await activate.run({ ...input, acknowledgeModeration: confirmation === 'activate' }); break;
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
  const busy = patch.running || submit.running || activate.running || deactivate.running || reindex.running || remove.running;
  function update(change: Partial<Fields>) {
    setDraft((current) => ({ kind: item!.kind, title: item!.title, body: item!.body,
      expectedRevision: item!.revision, ...current, ...change }));
  }
  const action = item.status === 'draft' ? 'submit' : item.status === 'active' ? 'deactivate' : 'activate';
  const missingContent = !fields.title.trim() || !fields.body.trim();
  function handleTransition() {
    if (action === 'activate' && item?.moderation?.status === 'flagged') setConfirmation('activate');
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
        {t(item.status === 'active' ? 'index.pendingRevision' : 'index.indexing')}
      </Alert>}
      {item.indexState === 'failed' && <Alert severity="warning">{t('index.failed')}</Alert>}
      <SectionCard>
        <Stack spacing={2}>
          <TextField select label={t('table.kind')} value={fields.kind} disabled={!editable || busy}
            onChange={(event) => update({ kind: event.target.value as Fields['kind'] })}>
            <MenuItem value="faq">{t('kind.faq')}</MenuItem>
            <MenuItem value="article">{t('kind.article')}</MenuItem>
          </TextField>
          <TextField label={t(fields.kind === 'faq' ? 'form.question' : 'form.title')} value={fields.title}
            onChange={(event) => update({ title: event.target.value })}
            slotProps={{ input: { readOnly: !editable || busy }, htmlInput: { maxLength: 255 } }} />
          <TextField multiline minRows={6} label={t(fields.kind === 'faq' ? 'form.answer' : 'form.body')} value={fields.body}
            helperText={t('form.count', { n: fields.body.length })}
            onChange={(event) => update({ body: event.target.value })}
            slotProps={{ input: { readOnly: !editable || busy }, htmlInput: { maxLength: 20000 } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {editable && <>
              <Button variant="contained" disabled={busy || !dirty} onClick={() => void save()}>{t('actions.save')}</Button>
              <Button variant="outlined" disabled={busy || dirty || (action === 'submit' && missingContent) ||
                (action === 'activate' && item.indexState !== 'ready')} onClick={handleTransition}>{t('actions.' + action)}</Button>
              {item.status !== 'draft' && (item.indexState === 'failed' || item.indexState === 'not_started') &&
                <Button disabled={busy || dirty} onClick={() => void transition('reindex').catch(() => {})}>{t('actions.reindex')}</Button>}
            </>}
            {canDelete && item.mutable && <Button color="error" disabled={busy} onClick={() => setConfirmation('delete')}>{t('actions.delete')}</Button>}
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
      confirmLabel={t('actions.activate')} onClose={() => setConfirmation(null)} onConfirm={() => transition('activate')} />
    <ConfirmDialog open={confirmation === 'leave'} title={t('form.unsaved')} message={t('form.unsavedMessage')} confirmLabel={t('actions.leave')}
      onClose={() => setConfirmation(null)} onConfirm={() => navigate('/knowledge')} />
  </>;
}

export default function KnowledgeEditPage() {
  const { itemId } = useParams();
  const businessId = useSession().currentBusiness?.id;
  return businessId && itemId ? <Editor key={businessId + ':' + itemId} id={itemId} /> : null;
}
