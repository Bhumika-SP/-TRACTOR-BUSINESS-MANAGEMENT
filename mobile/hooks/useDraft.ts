import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { storage } from '@/services/storage';

interface Draft<V> {
  values: V;
  requestId: string;
}

/**
 * Keeps an unsaved "new entry" form on the phone while the user types, so nothing is lost
 * if the app closes or the internet fails. Also holds a requestId for the form: if the same
 * entry is sent twice (double tap, retry after a lost reply) the server saves it only once.
 */
export function useDraft<V extends FieldValues>(key: string | null, form: UseFormReturn<V>) {
  const [requestId, setRequestId] = useState(() => Crypto.randomUUID());
  const [restored, setRestored] = useState(false);
  const [loaded, setLoaded] = useState(key === null);
  const requestIdRef = useRef(requestId);
  useEffect(() => {
    requestIdRef.current = requestId;
  }, [requestId]);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    storage.getDraft<Draft<V>>(key).then((draft) => {
      if (cancelled) return;
      if (draft?.values) {
        form.reset(draft.values);
        setRequestId(draft.requestId);
        setRestored(true);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!key || !loaded) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = form.watch((values) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void storage.setDraft(key, { values, requestId: requestIdRef.current });
      }, 400);
    });
    return () => {
      sub.unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [key, loaded, form]);

  /** Call after a successful save. */
  const clearDraft = useCallback(async () => {
    if (key) await storage.clearDraft(key);
    setRequestId(Crypto.randomUUID());
    setRestored(false);
  }, [key]);

  return { requestId, restored, loaded, clearDraft };
}
