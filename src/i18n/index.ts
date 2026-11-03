import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { RTL_LANGUAGES, type Language } from '@/domain/models/types';
import en from './locales/en.json';
import ar from './locales/ar.json';
import ur from './locales/ur.json';

export const SUPPORTED_LANGUAGES: Language[] = ['en', 'ar', 'ur'];

export function dirFor(language: Language): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
}

export function applyDocumentLanguage(language: Language): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.documentElement.dir = dirFor(language);
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
    ur: { translation: ur },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
