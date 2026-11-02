import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import {
  LOCALE_STORAGE_KEY,
  readPreferredLocale,
  type SupportedLocale,
} from './locale';

const initialLocale = readPreferredLocale();

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    en,
  },
});

export const getLocale = (): SupportedLocale =>
  i18n.global.locale.value as SupportedLocale;

export const setLocale = (locale: SupportedLocale) => {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Locale persistence is optional; the active locale still updates.
  }
};

document.documentElement.lang = initialLocale;
