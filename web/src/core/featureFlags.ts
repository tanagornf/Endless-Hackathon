import { useEffect, useState } from 'react';
import type { FeatureFlagView } from '@nless/shared/core/types';
import { api } from './api';
import { useSession } from './session';

type Flags = { production: boolean; items: FeatureFlagView[] };
type PublicFlags = { visibleFeatureIds: string[] };
let latest: Flags | null = null;
let inFlight: Promise<Flags> | null = null;
const load = () => inFlight ??= api.get<Flags>('/features').finally(() => { inFlight = null; });

function poll(refresh: () => void) {
  refresh();
  const timer = window.setInterval(refresh, 60000);
  window.addEventListener('focus', refresh);
  return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
}

export function useFeatures(includePublic = false) {
  const { status, user } = useSession();
  const [flags, setFlags] = useState<Flags | null>(latest);
  const [publicFlags, setPublicFlags] = useState<PublicFlags | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (status !== 'ready' || !user) { setFlags(null); return; }
    let active = true;
    const stop = poll(() => {
      void load().then((value) => {
        latest = value;
        if (active) { setFlags(value); setError(false); }
      }, () => { if (active) setError(true); });
    });
    return () => { active = false; stop(); };
  }, [status, user?.id]);

  useEffect(() => {
    if (!includePublic || status !== 'anonymous') { setPublicFlags(null); return; }
    let active = true;
    const stop = poll(() => {
      void api.get<PublicFlags>('/features/visible').then(
        (value) => { if (active) setPublicFlags(value); },
        () => { if (active) setPublicFlags({ visibleFeatureIds: [] }); },
      );
    });
    return () => { active = false; stop(); };
  }, [includePublic, status]);

  return {
    flags, error,
    publicLoading: import.meta.env.PROD && (status === 'loading' || (status === 'anonymous' && !publicFlags)),
    visible(id: string, publicRoute = false) {
      if (status === 'ready') return flags?.items.find((item) => item.featureId === id)?.visible ?? !import.meta.env.PROD;
      if (publicRoute && publicFlags) return publicFlags.visibleFeatureIds.includes(id);
      return !import.meta.env.PROD;
    },
  };
}
