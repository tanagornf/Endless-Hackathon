import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { CrmCustomerDetail } from '@nless/shared/features/crm/types';
import { useApiMutation } from '../../core';

const fields = ['phone', 'email', 'note'] as const;
type Field = typeof fields[number];
type Draft = { original: string; value: string };
type Patch = { expectedVersion: number } & Partial<Record<Field, string>>;

function contactValue(record: CrmCustomerDetail, field: Field) {
  return (field === 'note' ? record.note : record.contact[field]) ?? '';
}

export default function ContactFields({ record, editable, reload }: {
  record: CrmCustomerDetail; editable: boolean; reload: () => void;
}) {
  const { t } = useTranslation('crm');
  const [saved, setSaved] = useState(record);
  const latest = useRef(record);
  const active = useRef(false);
  const queue = useRef(Promise.resolve());
  const [drafts, setDrafts] = useState<Partial<Record<Field, Draft>>>({});
  const [busy, setBusy] = useState<Partial<Record<Field, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [conflict, setConflict] = useState(false);
  const update = useApiMutation<Patch, CrmCustomerDetail>('PATCH', '/crm/customers/'+encodeURIComponent(record.id)+'/profile', { toastOnError:false });

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    if (record.profileVersion >= latest.current.profileVersion) {
      latest.current = record;
      setSaved(record);
    }
  }, [record]);

  function edit(field: Field, value: string) {
    setDrafts(current => ({ ...current, [field]: { original:current[field]?.original ?? contactValue(saved,field), value } }));
    setErrors(current => ({...current, [field]:undefined}));
  }
  function discard(field: Field) {
    setDrafts(current => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }
  function save(field: Field) {
    const draft = drafts[field];
    if (!editable || !draft || busy[field]) return;
    const value = draft.value.trim();
    if (value === draft.original) { discard(field); return; }
    setBusy(current => ({ ...current, [field]:true }));
    // Consecutive field blurs share the version acknowledged by the preceding write.
    queue.current = queue.current.then(async () => {
      if (!active.current) return;
      try {
        if (contactValue(latest.current, field) !== draft.original) {
          discard(field);
          setConflict(true);
          reload();
          return;
        }
        const result = await update.run({ expectedVersion:latest.current.profileVersion, [field]:value });
        if (!active.current) return;
        if (result.profileVersion >= latest.current.profileVersion) {
          latest.current = result;
          setSaved(result);
        }
        discard(field);
      } catch (error) {
        if (!active.current) return;
        const code = error instanceof Error && 'code' in error ? error.code : undefined;
        if (code === 'VERSION_CONFLICT') {
          discard(field);
          setConflict(true);
          reload();
        } else {
          const failure = code === 'VALIDATION_ERROR' ? 'invalid.'+field : 'saveFailed';
          setErrors(current => ({ ...current, [field]:failure }));
        }
      } finally {
        if (active.current) setBusy(current => ({ ...current, [field]:false }));
      }
    });
  }
  return <Stack spacing={1.5}>
    <Typography variant="subtitle2">{t('contactDetails')}</Typography>
    {conflict && <Alert severity="warning" onClose={() => setConflict(false)}>{t('profileConflict')}</Alert>}
    {fields.map(field => <Stack key={field} spacing={0.5}>
      <TextField label={t(field)} size="small" fullWidth multiline={field==='note'} minRows={field==='note' ? 2 : undefined}
        type={field==='email' ? 'email' : field==='phone' ? 'tel' : 'text'}
        value={drafts[field]?.value ?? contactValue(saved,field)}
        onChange={event => edit(field,event.target.value)} onBlur={() => save(field)}
        error={Boolean(errors[field])} helperText={errors[field] ? t(errors[field]!) : busy[field] ? t('saving') : undefined}
        slotProps={{ input:{readOnly:!editable || busy[field]}, htmlInput:{
          'data-testid':'crm-'+field,maxLength:field==='note' ? 2000 : field==='email' ? 254 : 32,
          autoComplete:'off','aria-busy':Boolean(busy[field]),
        } }} />
      {errors[field]==='saveFailed' && <Button onClick={() => save(field)}>{t('retry')}</Button>}
    </Stack>)}
  </Stack>;
}
