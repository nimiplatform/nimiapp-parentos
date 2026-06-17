import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import modelConfigEn from '../locales/model-config.en.json';
import modelConfigZh from '../locales/model-config.zh.json';
import zh from '../locales/zh.json';
import {
  APP_LANGUAGES,
  detectDefaultAppLanguage,
  resolveAppLanguage,
  syncDocumentAppLanguage,
} from './language.js';

const resources = {
  en: { translation: { ...en, ModelConfig: modelConfigEn } },
  zh: { translation: { ...zh, ModelConfig: modelConfigZh } },
};

const detectedLanguage = detectDefaultAppLanguage();

function syncDocumentMeta(language: string): void {
  const appLanguage = resolveAppLanguage(language);
  syncDocumentAppLanguage(appLanguage);
  if (typeof document === 'undefined') {
    return;
  }
  document.title = i18n.t('Meta.title');
}

// Eager init — resources are statically bundled so init is synchronous.
// Must happen before React renders to avoid Suspense on useTranslation().
void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectedLanguage,
    supportedLngs: [...APP_LANGUAGES],
    nonExplicitSupportedLngs: true,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', (language) => {
  syncDocumentMeta(language);
});
syncDocumentMeta(detectedLanguage);

export function i18nText(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}

export function i18nTextForLanguage(language: string, key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, { ...options, lng: language });
}

export { i18n };
