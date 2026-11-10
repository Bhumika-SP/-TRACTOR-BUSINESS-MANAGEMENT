import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { storage } from '@/services/storage';

interface QueryState<T> {
  data: T | null;
  error: unknown;
  loading: boolean; // first load, nothing to show yet
  refreshing: boolean; // pull-to-refresh
  fromCache: boolean; // showing last saved copy because the internet failed
  refresh: () => Promise<void>;
}

/**
 * Loads data when the screen opens and every time it comes back into view, so all
 * users always see the latest shared data. The last good result is cached on the phone
 * and shown when there is no internet.
 */
export function useQuery<T>(key: string, fetcher: () => Promise<T>, opts: { enabled?: boolean } = {}): QueryState<T> {
  const enabled = opts.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const latestKey = useRef(key);
  latestKey.current = key;

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (!enabled) return;
      if (mode === 'refresh') setRefreshing(true);
      const requestKey = key;
      try {
        const result = await fetcherRef.current();
        if (latestKey.current !== requestKey) return; // filters changed meanwhile
        setData(result);
        setError(null);
        setFromCache(false);
        void storage.setCache(requestKey, result);
      } catch (err) {
        if (latestKey.current !== requestKey) return;
        setError(err);
        const cached = await storage.getCache<T>(requestKey);
        if (cached) {
          setData((current) => current ?? cached);
          setFromCache(true);
        }
      } finally {
        if (latestKey.current === requestKey) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [key, enabled],
  );

  useEffect(() => {
    setLoading(true);
    setData(null);
    void load('initial');
  }, [load]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void load('silent');
    }, [load]),
  );

  const refresh = useCallback(() => load('refresh'), [load]);
  return { data, error, loading: loading && data === null, refreshing, fromCache, refresh };
}
