import { FormControlLabel, MenuItem, Stack, Switch, TextField } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parsePriceToMinor } from '@nless/shared/features/catalog/money';
import type { CatalogItemAdminDetail, CatalogSkuCheck } from '@nless/shared/features/catalog/types';
import { useApiQuery } from '../../core';

export type CatalogFieldsState = {
  name: string; nameEn: string; sku: string; price: string; kind: 'product' | 'service';
  stock: string; duration: string; active: boolean; category: string; description: string; unit: string; shippable: boolean;
};

export function catalogFields(item?: CatalogItemAdminDetail, defaultUnit = ''): CatalogFieldsState {
  const minor = item?.priceMinor ?? 0;
  const cents = minor % 100;
  return {
    name: item?.name ?? '', nameEn: item?.nameEn ?? '', sku: item?.sku ?? '',
    price: item ? String(Math.floor(minor / 100)) + (cents ? '.' + String(cents).padStart(2, '0') : '') : '',
    stock: item?.stock == null ? '' : String(item.stock), kind: item?.kind ?? 'product',
    duration: String(item?.durationMinutes ?? 30), active: item?.active ?? true,
    category: item?.category ?? '', description: item?.description ?? '', unit: item?.unit ?? defaultUnit,
    shippable: item?.shippable ?? true,
  };
}

export function catalogValues(fields: CatalogFieldsState, create: boolean) {
  if (!fields.name.trim() || !fields.sku.trim()) return { error: 'error.required' } as const;
  if (!fields.unit.trim()) return { error: 'error.unit' } as const;
  const priceMinor = parsePriceToMinor(fields.price);
  if (priceMinor === null) return { error: 'error.price' } as const;
  const product = fields.kind === 'product';
  const stockText = fields.stock.trim();
  const stock = product && stockText ? Number(stockText) : null;
  if (create && stock !== null && (!/^\d+$/.test(stockText) || stock > 1_000_000)) return { error: 'error.stock' } as const;
  const durationMinutes = product ? null : Number(fields.duration);
  if (durationMinutes !== null && (!/^\d+$/.test(fields.duration.trim()) || durationMinutes < 5 || durationMinutes > 1440)) {
    return { error: 'error.duration' } as const;
  }
  return { data: {
    sku: fields.sku.trim(), name: fields.name.trim(), nameEn: fields.nameEn.trim() || null,
    priceMinor, active: fields.active, kind: fields.kind, stock, durationMinutes, shippable: product && fields.shippable,
    category: fields.category.trim() || null, description: fields.description.trim() || null, unit: fields.unit.trim(),
  } };
}

export default function CatalogFields({ value, onChange, disabled, creating, itemId }: {
  value: CatalogFieldsState;
  onChange: (change: Partial<CatalogFieldsState>) => void;
  disabled: boolean;
  creating: boolean;
  itemId?: string;
}) {
  const { t } = useTranslation('catalog');
  const [checkedSku, setCheckedSku] = useState('');
  const sku = value.sku.trim();
  const skuQuery = new URLSearchParams({ sku });
  if (itemId) skuQuery.set('excludeItemId', itemId);
  const availability = useApiQuery<CatalogSkuCheck>(checkedSku && checkedSku === sku && !disabled
    ? '/catalog/sku-check?' + skuQuery.toString() : null);
  const skuTaken = !!sku && checkedSku === sku && !!availability.data?.taken;
  const invalidSku = !!sku && checkedSku === sku && availability.error?.error.code === 'VALIDATION_ERROR';
  return <Stack spacing={2}>
    <TextField label={t('form.name')} value={value.name} onChange={(event) => onChange({ name: event.target.value })}
      autoFocus={creating} disabled={disabled} slotProps={{ htmlInput: { maxLength: 255 } }} />
    <TextField label={t('form.nameEn')} value={value.nameEn} onChange={(event) => onChange({ nameEn: event.target.value })}
      helperText={t('form.nameEnHelp')} disabled={disabled} slotProps={{ htmlInput: { maxLength: 255 } }} />
    <TextField label={t('form.sku')} value={value.sku} onChange={(event) => {
      setCheckedSku('');
      onChange({ sku: event.target.value });
    }} onBlur={() => setCheckedSku(sku)}
      disabled={disabled} error={skuTaken || invalidSku}
      helperText={skuTaken ? t('error.skuTaken') : invalidSku ? t('error.skuInvalid') : undefined}
      slotProps={{ htmlInput: { maxLength: 64 } }} />
    {creating && <TextField select label={t('form.kind')} value={value.kind} disabled={disabled}
      onChange={(event) => onChange({ kind: event.target.value as CatalogFieldsState['kind'] })}>
      <MenuItem value="product">{t('kind.product')}</MenuItem>
      <MenuItem value="service">{t('kind.service')}</MenuItem>
    </TextField>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField fullWidth label={t('form.category')} value={value.category}
        onChange={(event) => onChange({ category: event.target.value })} disabled={disabled}
        slotProps={{ htmlInput: { maxLength: 100 } }} />
      <TextField fullWidth label={t('form.unit')} value={value.unit}
        onChange={(event) => onChange({ unit: event.target.value })} disabled={disabled}
        slotProps={{ htmlInput: { maxLength: 30 } }} />
    </Stack>
    <TextField label={t('form.price')} value={value.price} onChange={(event) => onChange({ price: event.target.value })}
      disabled={disabled} slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 30 } }} />
    {value.kind === 'product' && <TextField label={t('form.stock')} value={value.stock}
      onChange={(event) => onChange({ stock: event.target.value })} helperText={t('form.stockHelp')}
      disabled={disabled || !creating} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 7 } }} />}
    {value.kind === 'service' && <TextField label={t('form.duration')} value={value.duration}
      onChange={(event) => onChange({ duration: event.target.value })} disabled={disabled}
      slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4 } }} />}
    <TextField multiline minRows={3} label={t('form.description')} value={value.description}
      onChange={(event) => onChange({ description: event.target.value })} disabled={disabled}
      slotProps={{ htmlInput: { maxLength: 2000 } }} />
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 2 }}>
      {value.kind === 'product' && <FormControlLabel label={t('form.shippable')} control={<Switch checked={value.shippable}
        onChange={(event) => onChange({ shippable: event.target.checked })} disabled={disabled} />} />}
      <FormControlLabel label={t('form.active')} control={<Switch checked={value.active}
        onChange={(event) => onChange({ active: event.target.checked })} disabled={disabled} />} />
    </Stack>
  </Stack>;
}
