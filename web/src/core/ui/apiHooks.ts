import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiFailure } from '@nless/shared/core/types';
import { api, failureOf } from '../api';
import { useSession } from '../session';
import type { ApiMutationMethod, ApiMutationOptions, ApiMutationState, ApiQueryOptions, ApiQueryState } from '../types';
import { getFailure, useToast } from './toast';

const failure = (error: unknown) => getFailure(error) ?? failureOf(0, 'Network unavailable');

export function useApiQuery<T>(path: string | null, opts?: ApiQueryOptions): ApiQueryState<T> {
  const businessScoped = opts?.businessScoped !== false;
  const { currentBusiness } = useSession();
  const businessId = businessScoped ? currentBusiness?.id : undefined;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<Omit<ApiQueryState<T>, 'reload'>>({ data: undefined, error: null, loading: false });
  const generation = useRef(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const currentDeps = opts?.deps ?? [];
  useEffect(() => {
    const key = ++generation.current;
    if (!path || (businessScoped && !businessId)) { setState({ data: undefined, error: null, loading: false }); return; }
    setState({ data: undefined, error: null, loading: true });
    void api.get<T>(businessScoped ? api.biz(path) : path).then(
      (data) => { if (generation.current === key) setState({ data, error: null, loading: false }); },
      (error) => { if (generation.current === key) setState({ data: undefined, error: failure(error), loading: false }); },
    );
    return () => { if (generation.current === key) generation.current++; };
  }, [businessId, businessScoped, path, revision, ...currentDeps]);
  return { ...state, reload };
}

export function useApiMutation<I, O>(method: ApiMutationMethod, path: string | ((input: I) => string), opts?: ApiMutationOptions): ApiMutationState<I, O> {
  const [count, setCount] = useState(0);
  const [error, setError] = useState<ApiFailure | null>(null);
  const toast = useToast();
  async function run(input: I): Promise<O> {
    setCount((state) => state + 1);
    setError(null);
    try {
      const requestPath = typeof path === 'function' ? path(input) : path;
      const target = opts?.businessScoped === false ? requestPath : api.biz(requestPath);
      switch (method) {
        case 'DELETE': return await api.delete(target);
        case 'POST': return await api.post(target, input);
        case 'PUT': return await api.put(target, input);
        case 'PATCH': return await api.patch(target, input);
      }
    } catch (cause) {
      const value = failure(cause);
      setError(value);
      if (opts?.toastOnError !== false) toast.error(value);
      throw cause;
    } finally { setCount((state) => state - 1); }
  }
  return { run, running: count > 0, error };
}
