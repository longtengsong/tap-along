export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_STORAGE_KEY = 'tap-along.locale';

export const normalizeLocale = (
  locale: string | null | undefined,
): SupportedLocale | null => {
  const normalized = locale?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }

  if (normalized.startsWith('en')) {
    return 'en';
  }

  return null;
};

export const resolveLocale = (
  preferred?: string | null,
  systemLocale?: string | null,
): SupportedLocale =>
  normalizeLocale(preferred) ?? normalizeLocale(systemLocale) ?? 'zh-CN';

export const getStoredLocale = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const getSystemLocale = (): string | null =>
  typeof navigator === 'undefined' ? null : navigator.language;

export const readPreferredLocale = (): SupportedLocale =>
  resolveLocale(getStoredLocale(), getSystemLocale());
