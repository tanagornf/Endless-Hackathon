import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionState } from '@nless/shared/core/loader';
import type { PermissionKey } from '@nless/shared/core/permissions';
import { api, setBusinessId } from './api';

const context = createContext<SessionState | null>(null);
const storageKey = 'nless.businessId';
const refreshDelays = [0, 250, 500];
const transientStatuses = new Set([0, 502, 503, 504]);
const saved = () => { try { return localStorage.getItem(storageKey); } catch { return null; } };
function store(id: string | null) {
  try { if (id) localStorage.setItem(storageKey, id); else localStorage.removeItem(storageKey); } catch { /* optional browser state */ }
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Pick<SessionState, 'status' | 'businesses' | 'user'>>({ status: 'loading', user: null, businesses: [] });
  const [chosen, setChosen] = useState(saved);
  const refreshVersion = useRef(0);
  const current = state.businesses.find((item) => item.business.id === chosen) ?? state.businesses[0];
  const currentId = current?.business.id ?? null;
  setBusinessId(currentId);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    for (const delay of refreshDelays) {
      if (delay) await new Promise<void>(resolve => setTimeout(resolve, delay));
      if (version !== refreshVersion.current) return;
      try {
        const data = await api.get<Pick<SessionState, 'user' | 'businesses'>>('/me');
        if (typeof data?.user?.id !== 'string' || !Array.isArray(data.businesses)) return;
        if (version === refreshVersion.current) setState({ status: 'ready', ...data });
        return;
      } catch (error) {
        if (version !== refreshVersion.current) return;
        const status = error instanceof Error && 'status' in error ? error.status : undefined;
        if (typeof status === 'number' && transientStatuses.has(status)) continue;
        if (status === 401) setState({ status: 'anonymous', user: null, businesses: [] });
        return;
      }
    }
    // An exhausted transient outage leaves the last verified state in place.
  }, []);
  useEffect(() => {
    void refresh();
    return () => { ++refreshVersion.current; };
  }, [refresh]);
  const selectBusiness = useCallback((id: string) => {
    if (state.businesses.some((item) => item.business.id === id)) {
      setChosen(id);
      store(id);
    }
  }, [state.businesses]);
  const logout = useCallback(async () => {
    await api.post('/session/logout');
    ++refreshVersion.current;
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
