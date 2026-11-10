import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storage } from '@/services/storage';
import { translations, type Language, type TranslationKey } from './translations';

interface I18nValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  /** "4 hr 10 min" */
  duration: (minutes: number) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en'); // English is the default

  useEffect(() => {
    storage.getLanguage().then((saved) => {
      if (saved === 'en' || saved === 'kn') setLangState(saved);
    });
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    void storage.setLanguage(next);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dict = translations[lang];
    const t = (key: TranslationKey) => dict[key] ?? translations.en[key] ?? key;
    const duration = (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      if (h && m) return `${h} ${t('hours')} ${m} ${t('minutes')}`;
      if (h) return `${h} ${t('hours')}`;
      return `${m} ${t('minutes')}`;
    };
    return { lang, setLang, t, duration };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
