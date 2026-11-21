import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionState } from '@nless/shared/core/loader';
import type { PermissionKey } from '@nless/shared/core/permissions';
import { api, setBusinessId } from './api';

const context = createContext<SessionState | null>(null);
const storageKey = 'nless.businessId';
const saved = () => { try { return localStorage.getItem(storageKey); } catch { return null; } };
function store(id: string | null) {
  try { if (id) localStorage.setItem(storageKey, id); else localStorage.removeItem(storageKey); } catch { /* optional browser state */ }
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Pick<SessionState, 'status' | 'businesses' | 'user'>>({ status: 'loading', user: null, businesses: [] });
  const [chosen, setChosen] = useState(saved);
  const current = state.businesses.find((item) => item.business.id === chosen) ?? state.businesses[0];
  const currentId = current?.business.id ?? null;
  setBusinessId(currentId);
  const refresh = useCallback(async () => {
    try {
      const data = await api.get<Pick<SessionState, 'user' | 'businesses'>>('/me');
      setState({ status: 'ready', ...data });
    } catch {
      setState({ status: 'anonymous', user: null, businesses: [] });
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const selectBusiness = useCallback((id: string) => {
    if (state.businesses.some((item) => item.business.id === id)) {
      setChosen(id);
      store(id);
    }
  }, [state.businesses]);
  const logout = useCallback(async () => {
    await api.post('/session/logout');
    setState({ status: 'anonymous', user: null, businesses: [] });
    setChosen(null);
    store(null);
    setBusinessId(null);
  }, []);
  const value = useMemo<SessionState>(() => ({ ...state, currentBusiness: current?.business ?? null, permissions: current?.permissions ?? [], selectBusiness, refresh, logout }),
    [state, current, selectBusiness, refresh, logout]);
  return <context.Provider value={value}>{children}</context.Provider>;
}
export function useSession(): SessionState {
  const state = useContext(context);
  if (!state) throw new Error('SessionProvider is required');
  return state;
}
export const useCan = (key: PermissionKey) => useSession().permissions.includes(key);
