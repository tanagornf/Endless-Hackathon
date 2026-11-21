import { createContext, useContext, useMemo, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ApiFailure } from '@nless/shared/core/types';
import type { ToastApi, ToastProviderProps } from '../types';

const context = createContext<ToastApi | null>(null);
type Toast = { id: number; severity: 'success' | 'error' | 'info'; message: string };
let sequence = 0;
export function getFailure(value: unknown): ApiFailure | null {
  if (!value || typeof value !== 'object') return null;
  if ('failure' in value) return getFailure(value.failure);
  if ('error' in value && 'meta' in value) return value as ApiFailure;
  return null;
}
export function ToastProvider({ children }: ToastProviderProps) {
  const { t } = useTranslation('common');
  const [queue, setQueue] = useState<Toast[]>([]);
  const api = useMemo<ToastApi>(() => {
    const push = (message: string, severity: Toast['severity']) => setQueue((previous) => [...previous, { id: sequence++, message, severity }]);
    return {
      success: (text) => push(text, 'success'), info: (text) => push(text, 'info'),
      error: (error) => {
        const failure = getFailure(error);
        if (failure) console.warn(failure.error.code, failure.meta.requestId);
        push(typeof error === 'string' ? error : failure ? t('errors.' + failure.error.code, { defaultValue: failure.error.message }) : t('errors.generic'), 'error');
      },
    };
  }, [t]);
  const first = queue[0];
  const dismiss = () => setQueue((previous) => previous.slice(1));
  return <context.Provider value={api}>{children}
    {first && <Snackbar key={first.id} open autoHideDuration={first.severity === 'error' ? 6000 : 3000} onClose={(_, reason) => { if (reason !== 'clickaway') dismiss(); }}>
      <Alert onClose={dismiss} severity={first.severity} role="alert">{first.message}</Alert>
    </Snackbar>}
  </context.Provider>;
}
const none = () => console.warn('ToastProvider is missing');
const fallback = { success: none, error: none, info: none };
export const useToast = (): ToastApi => useContext(context) ?? fallback;
