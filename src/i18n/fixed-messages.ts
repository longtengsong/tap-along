import type { ReplyLanguage } from '../shared/conversation-language';
import en from './locales/en.json' with { type: 'json' };
import zhCN from './locales/zh-CN.json' with { type: 'json' };

const messages: Record<ReplyLanguage, unknown> = {
  'zh-CN': zhCN,
  en,
};

const readMessage = (message: unknown, key: string): string | null => {
  let current = message;

  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' ? current : null;
};

export const translateFixedMessage = (
  locale: ReplyLanguage,
  key: string,
  params: Record<string, string> = {},
) => {
  const template = readMessage(messages[locale], key);

  if (!template) {
    return key;
  }

  return template.replace(/\{([^}]+)\}/g, (placeholder, name: string) => {
    return params[name] ?? placeholder;
  });
};
