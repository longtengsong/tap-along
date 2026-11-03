import assert from 'node:assert/strict';
import test from 'node:test';
import { createI18n } from 'vue-i18n';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import zhCN from '../src/i18n/locales/zh-CN.json' with { type: 'json' };

const fieldKeys = [
  'connectionTest',
  'system',
  'languagePolicy',
  'contextBoundary',
  'resume',
  'maintenance',
  'compressedContextPolicy',
  'currentPage',
  'closedPage',
  'targetPage',
  'editAction',
  'appendAction',
];

const groupKeys = ['provider', 'core', 'modes', 'context', 'maintenance'];

for (const [locale, messages] of [
  ['zh-CN', zhCN],
  ['en', en],
]) {
  test(`${locale} 应为每个开发者提示词提供名称和功能说明`, () => {
    const i18n = createI18n({
      legacy: false,
      locale,
      fallbackLocale: locale,
      messages: {
        [locale]: messages,
      },
    });

    for (const key of fieldKeys) {
      const field = messages.settings.promptFields[key];

      assert.equal(typeof field?.label, 'string', `${key}.label`);
      assert.equal(typeof field?.description, 'string', `${key}.description`);
      assert.ok(field.label.trim(), `${key}.label 不能为空`);
      assert.ok(field.description.trim(), `${key}.description 不能为空`);
      assert.doesNotThrow(() =>
        i18n.global.t(`settings.promptFields.${key}.description`),
      );
    }

    for (const key of groupKeys) {
      assert.ok(messages.settings.promptGroups[key]?.trim(), key);
    }
  });
}
