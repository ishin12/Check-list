import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import i18n, { applyDocumentLanguage } from '@/i18n';
import type { Language } from '@/domain/models/types';
import { useStorage } from './StorageContext';

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  ready: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const storage = useStorage();
  const [language, setLanguageState] = useState<Language>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    storage.getSettings().then((settings) => {
      if (!active) return;
      apply(settings.language);
      setReady(true);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = useCallback((lang: Language) => {
    setLanguageState(lang);
    i18n.changeLanguage(lang);
    applyDocumentLanguage(lang);
  }, []);

  const setLanguage = useCallback(
    (lang: Language) => {
      apply(lang);
      storage.saveSettings({ language: lang });
    },
    [apply, storage],
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  }, [language, setLanguage]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
