import LockOutlined from '@mui/icons-material/LockOutlined';
import { Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS, STAFF_DEFAULT_PERMISSIONS } from '@nless/shared/core/permissions';
import type { PermissionKey } from '@nless/shared/core/permissions';
import { VIEWER_PERMISSIONS } from '@nless/shared/features/tenancy/types';
import type { PermissionPresetId } from '@nless/shared/features/tenancy/types';

const permissionKeys = Object.keys(PERMISSIONS) as PermissionKey[];
const groups = [...new Set(permissionKeys.map((key) => PERMISSIONS[key].group))];
const presets: Record<PermissionPresetId, readonly PermissionKey[]> = {
  viewer: VIEWER_PERMISSIONS,
  chat_team: STAFF_DEFAULT_PERMISSIONS,
  manager: permissionKeys.filter((key) => PERMISSIONS[key].staff !== 'never'),
};
const presetNames = Object.keys(presets) as PermissionPresetId[];

interface PermissionMatrixProps {
  selected: PermissionKey[];
  invalidKeys: string[];
  onChange: (keys: PermissionKey[]) => void;
}

export default function PermissionMatrix({ selected, invalidKeys, onChange }: PermissionMatrixProps) {
  const { t } = useTranslation('tenancy');
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase();
  const shown = permissionKeys.filter((key) =>
    key.includes(term) || t('permission.' + key).toLocaleLowerCase().includes(term),
  );

  return (
    <>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {presetNames.map((preset) => (
          <Button key={preset} type="button" variant="outlined" size="small" onClick={() => onChange([...presets[preset]])}>
            {t('permissions.preset.' + preset)}
          </Button>
        ))}
      </Stack>
      <TextField size="small" fullWidth value={search} label={t('permissions.search')}
        onChange={(event) => setSearch(event.target.value)} />
      {!shown.length && <Typography color="text.secondary">{t('permissions.noMatch')}</Typography>}
      {groups.map((group) => {
        const keys = shown.filter((key) => PERMISSIONS[key].group === group);
        if (!keys.length) return null;
        return (
          <Stack key={group} component="section" sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
            <Typography variant="subtitle2">{t('permissions.group.' + group)}</Typography>
            {keys.map((key) => {
              const locked = PERMISSIONS[key].staff === 'never';
              return (
                <div key={key} data-testid={locked ? 'locked-permission' : undefined}>
                  <FormControlLabel
                    label={
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <span>{t('permission.' + key)}</span>
                        {locked && <><LockOutlined fontSize="inherit" /><span>{t('permissions.locked')}</span></>}
                      </Stack>
                    }
                    control={<Checkbox checked={selected.includes(key)} disabled={locked}
                      onChange={(_, checked) => onChange(checked ? [...selected, key] : selected.filter((item) => item !== key))} />}
                  />
                  {invalidKeys.includes(key) && <Typography variant="caption" color="error" component="p">
                    {t('permissions.invalid')}
                  </Typography>}
                </div>
              );
            })}
          </Stack>
        );
      })}
    </>
  );
}
