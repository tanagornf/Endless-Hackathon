import { Box, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

export interface DisplayedInstruction {
  versionLabel: string;
  instruction: string;
}

interface ComparisonProps {
  current: DisplayedInstruction | null;
  proposed?: DisplayedInstruction;
}

export default function ShopInstructionReviewComparison({ current, proposed }: ComparisonProps) {
  const { t } = useTranslation('business-settings');
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: proposed ? { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } : '1fr' }}>
      <InstructionText title={t('shopInstructions.current')} instruction={current} />
      {proposed && <InstructionText title={t('shopInstructions.proposed')} instruction={proposed} compareTo={current} />}
    </Box>
  );
}

interface InstructionTextProps {
  title: string;
  instruction: DisplayedInstruction | null;
  compareTo?: DisplayedInstruction | null;
}

function InstructionText({ title, instruction, compareTo }: InstructionTextProps) {
  const { t } = useTranslation('business-settings');
  return (
    <Paper component="section" variant="outlined" aria-label={title} sx={{ minWidth: 0, p: 2 }}>
      <Stack spacing={1.5}>
        <Typography component="h3" variant="subtitle1" fontWeight={600}>{title}</Typography>
        {instruction ? <>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {instruction.versionLabel}
          </Typography>
          <Typography dir="auto" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {instruction.instruction}
          </Typography>
          {compareTo !== undefined && (
            <Typography variant="caption" color="text.secondary">
              {t(instruction.instruction === compareTo?.instruction ? 'shopInstructions.unchanged' : 'shopInstructions.changed')}
            </Typography>
          )}
        </> : <Typography color="text.secondary">{t('shopInstructions.noCurrent')}</Typography>}
      </Stack>
    </Paper>
  );
}
