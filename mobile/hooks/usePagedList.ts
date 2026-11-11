import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageMeta, Paged } from '@/types/api';

const PAGE_SIZE = 20;

/** List with "load more" paging. Reloads from page 1 when filters (key) change or the screen is revisited. */
export function usePagedList<T>(key: string, fetchPage: (page: number, limit: number) => Promise<Paged<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fetchRef = useRef(fetchPage);
  const keyRef = useRef(key);
  // Keep refs pointing at the latest values (updated after render, before the reload effect below runs).
  useEffect(() => {
    fetchRef.current = fetchPage;
    keyRef.current = key;
  });

  // When the key (filters) changes, clear the old list straight away, during render.
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setLoading(true);
    setItems([]);
    setMeta(null);
  }

  const reload = useCallback(
    async (_mode: 'initial' | 'refresh' | 'silent') => {
      const requestKey = key;
      try {
        const res = await fetchRef.current(1, PAGE_SIZE);
        if (keyRef.current !== requestKey) return;
        setItems(res.data);
        setMeta(res.meta);
        setError(null);
      } catch (err) {
        if (keyRef.current === requestKey) setError(err);
      } finally {
        if (keyRef.current === requestKey) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [key],
  );

  useEffect(() => {
    void reload('initial');
  }, [reload]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void reload('silent');
    }, [reload]),
  );

  const hasMore = meta ? meta.page < meta.totalPages : false;

  const loadMore = useCallback(async () => {
    if (!meta || !hasMore || loadingMore) return;
    const requestKey = keyRef.current;
    setLoadingMore(true);
    try {
      const res = await fetchRef.current(meta.page + 1, PAGE_SIZE);
      if (keyRef.current !== requestKey) return;
      setItems((prev) => [...prev, ...res.data]);
      setMeta(res.meta);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  }, [meta, hasMore, loadingMore]);

  return { items, meta, loading, loadingMore, refreshing, error, hasMore, loadMore, refresh: () => {
      setRefreshing(true);
      return reload('refresh');
    } };
}
