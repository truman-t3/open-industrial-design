import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  resolveAppLocale,
  translate,
  type AppLocale,
  type MessageKey,
} from '@open-industrial-design/core';

const localeStorageKey = 'open-industrial-design.locale';

export interface LocalizationContextValue {
  locale: AppLocale;
  setLocale(locale: AppLocale): void;
  t(key: MessageKey, variables?: Record<string, string | number>): string;
}

const LocalizationContext = createContext<LocalizationContextValue | undefined>(undefined);

function getInitialLocale(): AppLocale {
  try {
    return resolveAppLocale(window.localStorage.getItem(localeStorageKey) ?? navigator.language);
  } catch {
    return resolveAppLocale(typeof navigator === 'undefined' ? undefined : navigator.language);
  }
}

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(getInitialLocale);
  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    try {
      window.localStorage.setItem(localeStorageKey, nextLocale);
    } catch {
      // A blocked localStorage must not prevent the application from switching language in memory.
    }
  }, []);
  const value = useMemo<LocalizationContextValue>(
    () => ({ locale, setLocale, t: (key, variables) => translate(locale, key, variables) }),
    [locale, setLocale],
  );
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization(): LocalizationContextValue {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error('useLocalization must be used inside LocalizationProvider.');
  return context;
}

/** Browser-local preference control. It is intentionally unrelated to Project serialization. */
export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocalization();
  return (
    <label
      className={compact ? 'language-selector language-selector--compact' : 'language-selector'}
    >
      <span>{t('language.label')}</span>
      <select
        aria-label={t('language.label')}
        onChange={(event) => setLocale(event.target.value as AppLocale)}
        value={locale}
      >
        <option value="zh-CN">{t('language.zh-CN')}</option>
        <option value="en">{t('language.en')}</option>
      </select>
    </label>
  );
}
