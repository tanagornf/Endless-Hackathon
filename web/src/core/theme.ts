import { createTheme } from '@mui/material/styles';
import type { ThemeOptions } from '@mui/material/styles';

const heading = { fontWeight: 600 };
const options: ThemeOptions = {
  palette: {
    primary: { main: '#0F766E', dark: '#0D514F', light: '#DEEFEB' },
    secondary: { main: '#B45309' },
    background: { default: '#F6F7F9', paper: '#FFFFFF' },
    text: { primary: '#172F32', secondary: '#53696B' },
    divider: '#DCE5E4',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter","Noto Sans Thai",system-ui,sans-serif',
    h1: heading, h2: heading, h3: heading, h4: heading, h5: heading,
    h6: { ...heading, fontSize: '1.05rem' }, button: { ...heading, textTransform: 'none' },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 44 } } },
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiCard: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { boxShadow: '0 3px 16px #193a3410' } } },
    MuiCardHeader: { styleOverrides: { root: { borderBottom: '1px solid #e6ebeb', padding: '16px 20px' } } },
    MuiTableCell: { defaultProps: { size: 'small' }, styleOverrides: {
      root: { borderBottomColor: '#E5EBEA', padding: '12px 16px' },
      head: { color: '#476162', backgroundColor: '#F1F6F5', fontWeight: 600, fontSize: '.8rem' },
    } },
    MuiTableRow: { styleOverrides: { root: { '&:last-child td': { borderBottom: 0 } } } },
    MuiChip: {
      defaultProps: { size: 'small' },
      styleOverrides: { root: {
        fontWeight: 600,
        '&[aria-pressed]': {
          height: 28,
          minHeight: 28,
          minWidth: 44,
          '@media (any-pointer: coarse)': {
            // Reserve the full tap target even when the filters wrap.
            position: 'relative',
            overflow: 'visible',
            marginBlock: 8,
            '&::after': {
              content: '""', position: 'absolute', insetInline: 0,
              top: '50%', height: 44, transform: 'translateY(-50%)',
            },
          },
        },
      } },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', minHeight: 44 } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiCssBaseline: { styleOverrides: {
      ':focus-visible': { outline: '3px solid #219486', outlineOffset: 2 },
      'body': { overflowWrap: 'break-word' },
      'body, button, input, textarea': { WebkitFontSmoothing: 'antialiased' },
    } },
  },
};

export const theme = createTheme(options);

// Keep team controls inline until the transcript has room for a third column.
export const inboxTheme = createTheme({
  ...options,
  breakpoints: { values: { ...theme.breakpoints.values, md: 1360, lg: 1440 } },
});
