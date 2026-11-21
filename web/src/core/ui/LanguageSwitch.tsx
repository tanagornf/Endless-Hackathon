import { Button, ButtonGroup } from '@mui/material';
import { useTranslation } from 'react-i18next';

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation('common');
  return <ButtonGroup size={compact ? 'small' : 'medium'} data-testid="lang-switch" aria-label={t('language.switch')}>
    {(['th', 'en'] as const).map((language) => <Button key={language} aria-pressed={i18n.resolvedLanguage === language}
      variant={i18n.resolvedLanguage === language ? 'contained' : 'outlined'}
      onClick={() => void i18n.changeLanguage(language)}>{language.toUpperCase()}</Button>)}
  </ButtonGroup>;
}
