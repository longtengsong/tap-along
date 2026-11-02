import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectLatestLanguage,
  findRecentLanguage,
  resolveMockReplyLanguage,
} from '../src/shared/conversation-language.ts';
import { TEACHER_SYSTEM_PROMPT } from '../src/main/services/teacher-prompt.ts';

test('语言检测应识别中文、英文、其他文字和无语言信号', () => {
  assert.equal(detectLatestLanguage('这个问题怎么理解？'), 'zh');
  assert.equal(detectLatestLanguage('How should I understand this?'), 'en');
  assert.equal(detectLatestLanguage('これは質問です'), 'other');
  assert.equal(detectLatestLanguage('123 😊'), 'unknown');
});

test('中英文混合时应优先中文', () => {
  assert.equal(detectLatestLanguage('请用 English 解释 attention'), 'zh');
  assert.equal(detectLatestLanguage('English 和中文 mixed'), 'zh');
});

test('无语言信号时应沿用最近一条有效用户语言', () => {
  assert.equal(findRecentLanguage(['English', '123', '😊']), 'en');
  assert.equal(findRecentLanguage(['中文', '123']), 'zh');
  assert.equal(findRecentLanguage(['123', '😊']), null);
  assert.equal(resolveMockReplyLanguage('😊', ['English thought']), 'en');
  assert.equal(
    resolveMockReplyLanguage('中文想法', ['English thought']),
    'zh-CN',
  );
});

test('真实模型 Prompt 应要求跟随最新用户语言并中文优先', () => {
  assert.match(TEACHER_SYSTEM_PROMPT, /latest user message/);
  assert.match(TEACHER_SYSTEM_PROMPT, /both Chinese and English/);
  assert.match(TEACHER_SYSTEM_PROMPT, /respond in Chinese/);
  assert.match(TEACHER_SYSTEM_PROMPT, /overrides the language/);
  assert.match(TEACHER_SYSTEM_PROMPT, /Do not use the application UI language/);
});
