import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/500.css';
import '@fontsource/noto-sans-thai/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/prompt/500.css';
import '@fontsource/prompt/600.css';
import '@fontsource/manrope/600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import App from './App';
import { i18nReady } from './i18n';
import { SessionProvider } from './session';
import { theme } from './theme';
import { ToastProvider } from './ui';

void i18nReady.then(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode>
    <ThemeProvider theme={theme}><CssBaseline />
      <ToastProvider><BrowserRouter><SessionProvider><App /></SessionProvider></BrowserRouter></ToastProvider>
    </ThemeProvider>
  </StrictMode>);
});
