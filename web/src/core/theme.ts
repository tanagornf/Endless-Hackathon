import { createTheme } from '@mui/material/styles';

const heading = { fontFamily: '"Prompt","Noto Sans Thai",sans-serif', fontWeight: 600 };
export const theme = createTheme({
  palette: { primary: { main: '#0F766E' }, secondary: { main: '#B45309' }, background: { default: '#F6F7F9' } },
  shape: { borderRadius: 10 },
  typography: { fontFamily: '"Noto Sans Thai","Inter",system-ui,sans-serif', h1: heading, h2: heading, h3: heading,
    h4: heading, h5: heading, h6: heading, button: { ...heading, textTransform: 'none' } },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiTableCell: { defaultProps: { size: 'small' } },
    MuiChip: { defaultProps: { size: 'small' } },
  },
});
