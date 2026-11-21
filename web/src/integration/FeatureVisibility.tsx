import { useState } from 'react';
import { Switch } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { FeatureFlagView } from '@nless/shared/core/types';
import { api, DataTable, useApiQuery, useToast } from '../core';
import { ServiceAlert } from './ResourcePanel';

export function FeatureVisibility() {
  const { t } = useTranslation('integration');
  const query = useApiQuery<{items: FeatureFlagView[]}>('/features',{businessScoped:false});
  const [busy,setBusy] = useState(false);
  const toast = useToast();
  return <>
    {query.error && <ServiceAlert code={query.error.error.code} retry={query.reload} />}
    <DataTable rows={query.data?.items ?? []} loading={query.loading} rowKey={item => item.featureId} columns={[
      {key:'featureId',header:t('field.featureId')},{key:'slug',header:t('field.slug')},
      {key:'visible',header:t('field.visible'),render:item => <Switch checked={!item.hidden} disabled={busy || query.loading}
        slotProps={{input:{'aria-label':item.slug}}} onChange={async e => {
          setBusy(true);
          try {await api.put('/ops/features/'+encodeURIComponent(item.featureId),{hidden:!e.target.checked});query.reload();}
          catch (cause) {toast.error(cause);} finally {setBusy(false);}
        }} />},
    ]} />
  </>;
}
