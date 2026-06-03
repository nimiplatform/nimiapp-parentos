import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import modelConfigEn from '../locales/model-config.en.json';
import modelConfigZh from '../locales/model-config.zh.json';
import zh from '../locales/zh.json';

const resources = {
  en: { translation: { ...en, ModelConfig: modelConfigEn } },
  zh: { translation: { ...zh, ModelConfig: modelConfigZh } },
};

const detectedLanguage = navigator.language?.startsWith('zh') ? 'zh' : 'en';

// Eager init — resources are statically bundled so init is synchronous.
// Must happen before React renders to avoid Suspense on useTranslation().
void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export { i18n };
