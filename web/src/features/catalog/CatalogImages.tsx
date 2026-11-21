import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogImage, CatalogItemAdminDetail } from '@nless/shared/features/catalog/types';
import { api, SectionCard } from '../../core';

interface Props {
  item: CatalogItemAdminDetail;
  canWrite: boolean;
  onChange(images: CatalogImage[]): void;
}

export default function CatalogImages({ item, canWrite, onChange }: Props) {
  const { t } = useTranslation('catalog');
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const path = api.biz('/catalog/items/' + item.id + '/images');

  async function update(request: () => Promise<CatalogItemAdminDetail>) {
    setBusy(true);
    setFailed(false);
    try { onChange((await request()).images); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }

  function upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    form.append('alt', alt);
    void update(async () => {
      const saved = await api.upload<CatalogItemAdminDetail>(path, form);
      setAlt('');
      return saved;
    });
  }

  function move(id: string, offset: number) {
    const ids = item.images.map((image) => image.id);
    const from = ids.indexOf(id);
    [ids[from], ids[from + offset]] = [ids[from + offset], ids[from]];
    void update(() => api.put(path + '/order', { imageIds: ids }));
  }

  let uploadAction: ReactNode;
  if (canWrite && item.images.length < 5) {
    uploadAction = <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
      <TextField size="small" label={t('images.alt')} value={alt} disabled={busy}
        slotProps={{ htmlInput: { maxLength: 255 } }} onChange={(event) => setAlt(event.target.value)} />
      <Button variant="outlined" component="label" disabled={busy}>
        {t('images.upload')}
        <input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) upload(file);
        }} />
      </Button>
    </Stack>;
  }
  return <SectionCard title={t('images.title')}>
    <Stack spacing={1.5}>
      {failed && <Alert severity="error">{t('images.error')}</Alert>}
      {item.images.map((image, index) => <Stack key={image.id} direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
        sx={{ alignItems: { sm: 'center' } }}>
        <Box component="img" src={image.url} alt={image.alt || item.name}
          sx={{ height: 76, width: 96, objectFit: 'contain', borderRadius: 1 }} />
        <Stack spacing={0.5} sx={{ alignItems: 'flex-start', flexGrow: 1 }}>
          {image.alt && <Typography variant="body2">{image.alt}</Typography>}
          {index === 0 && <Chip size="small" label={t('images.primary')} />}
          {image.flagged && <Chip size="small" label={t('images.flagged')} color="warning" />}
        </Stack>
        {canWrite && <Stack direction="row" spacing={0.5}>
          {index > 0 && <Button disabled={busy} onClick={() => move(image.id, -1)}>{t('images.earlier')}</Button>}
          {index < item.images.length - 1 && <Button disabled={busy} onClick={() => move(image.id, 1)}>{t('images.later')}</Button>}
          <Button disabled={busy} color="error" onClick={() => void update(() => api.delete(path + '/' + image.id))}>
            {t('images.remove')}
          </Button>
        </Stack>}
      </Stack>)}
      {!!uploadAction && <Typography variant="body2" color="text.secondary">{t('images.formats')}</Typography>}
      {uploadAction}
      {(!canWrite && !item.images.length) && <Typography variant="body2">{t('images.empty')}</Typography>}
    </Stack>
  </SectionCard>;
}
