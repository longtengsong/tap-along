import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeLocale, resolveLocale } from '../src/i18n/locale.ts';
import { APP_ERROR_CODES, ERROR_MESSAGE_KEYS } from '../src/shared/errors.ts';

const localeDirectory = new URL('../src/i18n/locales/', import.meta.url);

const loadMessages = async (filename) =>
  JSON.parse(await readFile(new URL(filename, localeDirectory), 'utf8'));

const flattenMessages = (messages, prefix = '') =>
  Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    return value && typeof value === 'object'
      ? flattenMessages(value, path)
      : [[path, value]];
  });

const extractPlaceholders = (value) =>
  [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();

test('中英文资源应包含完全一致的 Key', async () => {
  const zhMessages = flattenMessages(await loadMessages('zh-CN.json'));
  const enMessages = flattenMessages(await loadMessages('en.json'));

  assert.deepEqual(
    zhMessages.map(([key]) => key).sort(),
    enMessages.map(([key]) => key).sort(),
  );
});

test('中英文文案应非空且占位符一致', async () => {
  const zhMessages = new Map(flattenMessages(await loadMessages('zh-CN.json')));
  const enMessages = new Map(flattenMessages(await loadMessages('en.json')));

  for (const [key, zhText] of zhMessages) {
    const enText = enMessages.get(key);

    assert.equal(typeof zhText, 'string', `${key} 应为字符串`);
    assert.equal(typeof enText, 'string', `${key} 应为字符串`);
    assert.ok(zhText.trim(), `${key} 的中文文案不能为空`);
    assert.ok(enText.trim(), `${key} 的英文文案不能为空`);
    assert.deepEqual(
      extractPlaceholders(zhText),
      extractPlaceholders(enText),
      `${key} 的占位符不一致`,
    );
  }
});

test('locale 应优先使用已保存语言并识别系统语言', () => {
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('zh-TW'), 'zh-CN');
  assert.equal(normalizeLocale('fr-FR'), null);
  assert.equal(resolveLocale('en', 'zh-CN'), 'en');
  assert.equal(resolveLocale('invalid', 'en-US'), 'en');
  assert.equal(resolveLocale(null, 'fr-FR'), 'zh-CN');
});

test('每个 IPC 错误码都应有中英文文案映射', async () => {
  const zhKeys = new Set(
    flattenMessages(await loadMessages('zh-CN.json')).map(([key]) => key),
  );
  const enKeys = new Set(
    flattenMessages(await loadMessages('en.json')).map(([key]) => key),
  );

  for (const errorCode of APP_ERROR_CODES) {
    const messageKey = ERROR_MESSAGE_KEYS[errorCode];
    assert.equal(zhKeys.has(messageKey), true, `${errorCode} 缺少中文文案`);
    assert.equal(enKeys.has(messageKey), true, `${errorCode} 缺少英文文案`);
  }
});
