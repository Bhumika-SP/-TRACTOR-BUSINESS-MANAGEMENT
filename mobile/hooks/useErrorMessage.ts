import { useCallback } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { ApiError } from '@/services/api';

/** Turns any error into a short message the user can understand. */
export function useErrorMessage() {
  const { t } = useI18n();
  return useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError) {
        if (err.isNetwork) return t('networkError');
        if (err.status === 401) return t('sessionExpired');
        if (err.code === 'SERVER_ERROR' || err.message === 'SERVER') return t('somethingWrong');
        return err.message;
      }
      return t('somethingWrong');
    },
    [t],
  );
}
