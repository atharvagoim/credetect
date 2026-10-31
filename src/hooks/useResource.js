import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

/** Fetch a GET endpoint. Re-runs when `path` changes. Pass null to skip. */
export function useResource(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  const seq = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!path) return;
      const id = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const d = await api.get(path);
        if (id === seq.current) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (id === seq.current) setError(e);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [path],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

/** Wraps an async action with pending + error state. */
export function useAction(fn) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(
    async (...args) => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(e);
        throw e;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending, error, setError };
}
