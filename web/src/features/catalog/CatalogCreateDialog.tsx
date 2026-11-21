import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CatalogItemAdminDetail } from '@nless/shared/features/catalog/types';
import { FormDialog, useApiMutation, useToast } from '../../core';
import CatalogFields, { catalogFields, catalogValues } from './CatalogFields';

type CreateInput = NonNullable<ReturnType<typeof catalogValues>['data']>;

export default function CatalogCreateDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('catalog');
  const navigate = useNavigate();
  const toast = useToast();
  const [fields, setFields] = useState(() => catalogFields(undefined, t('form.defaultUnit')));
  const [error, setError] = useState<string | null>(null);
  const create = useApiMutation<CreateInput, CatalogItemAdminDetail>('POST', '/catalog/items', { toastOnError: false });
  return <FormDialog open title={t('actions.add')} error={error} submitting={create.running} onClose={onClose}
    submitLabel={t('actions.save')} onSubmit={async () => {
      const parsed = catalogValues(fields, true);
      setError(null);
      if (parsed.error) {
        setError(t(parsed.error));
        return;
      }
      try {
        const item = await create.run(parsed.data);
        toast.success(t('toast.created'));
        onClose();
        navigate('/catalog/' + item.id);
      } catch (cause) {
        const details = cause && typeof cause === 'object' && 'details' in cause ? cause.details : null;
        const skuTaken = details && typeof details === 'object' && 'code' in details && details.code === 'sku_taken';
        setError(t(skuTaken ? 'error.skuTaken' : 'error.save'));
      }
    }}>
    <CatalogFields value={fields} disabled={create.running} creating
      onChange={(change) => setFields((old) => ({ ...old, ...change }))} />
  </FormDialog>;
}
