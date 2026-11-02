export type DetectedLanguage = 'zh' | 'en' | 'other' | 'unknown';

export type ReplyLanguage = 'zh-CN' | 'en';

const HAN_PATTERN = /\p{Script=Han}/u;
const OTHER_SCRIPT_PATTERN =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Devanagari}]/u;
const LATIN_PATTERN = /\p{Script=Latin}/u;

export const detectLatestLanguage = (
  text: string,
  fallback: DetectedLanguage = 'unknown',
): DetectedLanguage => {
  const normalized = text.normalize('NFKC');

  if (OTHER_SCRIPT_PATTERN.test(normalized)) {
    return 'other';
  }

  if (HAN_PATTERN.test(normalized)) {
    return 'zh';
  }

  if (LATIN_PATTERN.test(normalized)) {
    return 'en';
  }

  return fallback;
};

export const findRecentLanguage = (
  previousUserTexts: string[],
): DetectedLanguage | null => {
  for (let index = previousUserTexts.length - 1; index >= 0; index -= 1) {
    const language = detectLatestLanguage(previousUserTexts[index] ?? '');

    if (language !== 'unknown') {
      return language;
    }
  }

  return null;
};

export const resolveMockReplyLanguage = (
  latestUserText: string,
  previousUserTexts: string[] = [],
): ReplyLanguage => {
  const previousLanguage = findRecentLanguage(previousUserTexts);
  const detected = detectLatestLanguage(
    latestUserText,
    previousLanguage ?? 'unknown',
  );

  return detected === 'en' ? 'en' : 'zh-CN';
};

export const extractContentKeyword = (
  text: string,
  language: ReplyLanguage = resolveMockReplyLanguage(text),
) => {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? '';

  if (language === 'en') {
    return (
      firstLine
        .replace(/[.,!?;:"']/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 5)
        .join(' ') || 'this'
    );
  }

  return firstLine.replace(/[，。、；：“”‘’？！\s]/g, '').slice(0, 6) || '这页';
};
