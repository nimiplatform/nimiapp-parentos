// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAppSettingMock = vi.fn();
const setAppSettingMock = vi.fn();

vi.mock('../bridge/sqlite-bridge.js', () => ({
  getAppSetting: getAppSettingMock,
  setAppSetting: setAppSettingMock,
}));

vi.mock('../bridge/ulid.js', () => ({
  isoNow: () => '2026-06-16T08:00:00.000Z',
}));

const {
  APP_LANGUAGE_SETTING_KEY,
  loadAndApplyPersistedAppLanguage,
  loadPersistedAppLanguage,
  saveAndApplyAppLanguage,
} = await import('./app-language.js');
const {
  detectDefaultAppLanguage,
  parseStoredAppLanguage,
} = await import('./language.js');
const { i18n } = await import('./index.js');

describe('app language persistence', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    getAppSettingMock.mockResolvedValue(null);
    setAppSettingMock.mockResolvedValue(undefined);
    await i18n.changeLanguage('zh');
    document.documentElement.lang = 'zh-CN';
  });

  afterEach(async () => {
    await i18n.changeLanguage('zh');
    document.documentElement.lang = 'zh-CN';
  });

  it('parses only hard-cut supported stored language values', () => {
    expect(parseStoredAppLanguage('zh')).toBe('zh');
    expect(parseStoredAppLanguage('en')).toBe('en');
    expect(parseStoredAppLanguage('zh-CN')).toBeNull();
    expect(parseStoredAppLanguage('fr')).toBeNull();
  });

  it('detects Chinese browser locales and otherwise defaults to English', () => {
    expect(detectDefaultAppLanguage('zh-CN')).toBe('zh');
    expect(detectDefaultAppLanguage('zh-Hans')).toBe('zh');
    expect(detectDefaultAppLanguage('en-US')).toBe('en');
  });

  it('returns null when no app language is persisted', async () => {
    await expect(loadPersistedAppLanguage()).resolves.toBeNull();
  });

  it('applies the detected default when the current account has no persisted language', async () => {
    await i18n.changeLanguage('zh');
    await loadAndApplyPersistedAppLanguage();

    const expected = detectDefaultAppLanguage();
    expect(i18n.resolvedLanguage).toBe(expected);
    expect(document.documentElement.lang).toBe(expected === 'zh' ? 'zh-CN' : 'en');
  });

  it('fails closed when a persisted app language value is invalid', async () => {
    getAppSettingMock.mockResolvedValue('zh-CN');

    await expect(loadPersistedAppLanguage()).rejects.toThrow('Persisted ParentOS app language is invalid');
  });

  it('loads and applies a persisted language after app storage is ready', async () => {
    getAppSettingMock.mockResolvedValue('en');

    await loadAndApplyPersistedAppLanguage();

    expect(i18n.resolvedLanguage).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('persists then applies a user-selected language', async () => {
    await saveAndApplyAppLanguage('en');

    expect(setAppSettingMock).toHaveBeenCalledWith(
      APP_LANGUAGE_SETTING_KEY,
      'en',
      '2026-06-16T08:00:00.000Z',
    );
    expect(i18n.resolvedLanguage).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
