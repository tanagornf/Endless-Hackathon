import { Button } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function ImportButton() {
  const { t } = useTranslation('knowledge-import');
  return <Button component={Link} to="/imports">{t('knowledgeButton')}</Button>;
}
