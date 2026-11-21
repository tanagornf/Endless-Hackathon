import { useEffect, useState } from 'react';
import type { FeatureFlagView } from '@nless/shared/core/types';
import { api } from './api';
import { useSession } from './session';

type Flags = { production: boolean; items: FeatureFlagView[] };
let latest: Flags | null = null;
let inFlight: Promise<Flags> | null = null;
const load = () => inFlight ??= api.get<Flags>('/features').finally(() => { inFlight = null; });

export function useFeatures() {
  const { status, user } = useSession();
  const [flags, setFlags] = useState<Flags | null>(latest);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (status !== 'ready' || !user) { setFlags(null); return; }
    let active = true;
    const refresh = () => {
      void load().then((value) => {
        latest = value;
        if (active) { setFlags(value); setError(false); }
      }, () => { if (active) setError(true); });
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [status, user?.id]);
  return { flags, error, visible: (id: string) => flags?.items.find((item) => item.featureId === id)?.visible ?? !import.meta.env.PROD };
}
