export const APP_LANGUAGES = ['zh', 'en'] as const;

export type AppLanguage = typeof APP_LANGUAGES[number];

export const APP_LANGUAGE_LABELS: Record<AppLanguage, string> = {
  zh: '中文',
  en: 'English',
};

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'zh' || value === 'en';
}

export function parseStoredAppLanguage(value: unknown): AppLanguage | null {
  const normalized = String(value ?? '').trim();
  return isAppLanguage(normalized) ? normalized : null;
}

export function detectDefaultAppLanguage(language?: string | null): AppLanguage {
  const candidate = String(
    language ?? (typeof navigator === 'undefined' ? '' : navigator.language),
  ).trim().toLowerCase();
  return candidate === 'zh' || candidate.startsWith('zh-') ? 'zh' : 'en';
}

export function resolveAppLanguage(language: unknown): AppLanguage {
  const stored = parseStoredAppLanguage(language);
  if (stored) {
    return stored;
  }
  return detectDefaultAppLanguage(String(language ?? ''));
}

export function syncDocumentAppLanguage(language: AppLanguage): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
}
