import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/noto-sans-thai/thai-400.css';
import '@fontsource/noto-sans-thai/thai-500.css';
import '@fontsource/noto-sans-thai/thai-600.css';
import '@fontsource/noto-sans-thai/thai-700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import App from './App';
import { PageRecovery, recoverMissingModule } from './PageRecovery';
import { i18nReady } from './i18n';
import { SessionProvider } from './session';
import { theme } from './theme';
import { ToastProvider } from './ui';

window.addEventListener('vite:preloadError', (event) => {
  const error = (event as Event & { payload?: Error }).payload;
  if (/dynamically imported module|module script|importing a module|preload CSS/i.test(error?.message ?? '')) {
    recoverMissingModule();
  }
});

void i18nReady.then(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode>
    <ThemeProvider theme={theme}><CssBaseline />
      <PageRecovery><ToastProvider><BrowserRouter><SessionProvider><App /></SessionProvider></BrowserRouter></ToastProvider></PageRecovery>
    </ThemeProvider>
  </StrictMode>);
});
