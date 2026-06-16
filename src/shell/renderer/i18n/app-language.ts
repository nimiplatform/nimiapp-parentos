import { getAppSetting, setAppSetting } from '../bridge/sqlite-bridge.js';
import { isoNow } from '../bridge/ulid.js';
import { i18n } from './index.js';
import {
  type AppLanguage,
  detectDefaultAppLanguage,
  isAppLanguage,
  parseStoredAppLanguage,
  resolveAppLanguage,
  syncDocumentAppLanguage,
} from './language.js';

export const APP_LANGUAGE_SETTING_KEY = 'parentos.app.language';

export async function applyAppLanguage(language: AppLanguage): Promise<void> {
  if (!isAppLanguage(language)) {
    throw new Error(`Unsupported ParentOS language: ${String(language)}`);
  }
  if (resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language) !== language) {
    await i18n.changeLanguage(language);
  }
  syncDocumentAppLanguage(language);
}

export async function loadPersistedAppLanguage(): Promise<AppLanguage | null> {
  const raw = await getAppSetting(APP_LANGUAGE_SETTING_KEY);
  if (raw == null || !raw.trim()) {
    return null;
  }
  const parsed = parseStoredAppLanguage(raw);
  if (!parsed) {
    throw new Error('Persisted ParentOS app language is invalid');
  }
  return parsed;
}

export async function loadAndApplyPersistedAppLanguage(): Promise<void> {
  const persistedLanguage = await loadPersistedAppLanguage();
  if (persistedLanguage) {
    await applyAppLanguage(persistedLanguage);
    return;
  }
  await applyAppLanguage(detectDefaultAppLanguage());
}

export async function saveAndApplyAppLanguage(language: AppLanguage): Promise<void> {
  if (!isAppLanguage(language)) {
    throw new Error(`Unsupported ParentOS language: ${String(language)}`);
  }
  await setAppSetting(APP_LANGUAGE_SETTING_KEY, language, isoNow());
  await applyAppLanguage(language);
}
