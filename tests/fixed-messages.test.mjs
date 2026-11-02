import assert from 'node:assert/strict';
import test from 'node:test';
import { translateFixedMessage } from '../src/i18n/fixed-messages.ts';

test('老师固定话术应按指定语言和参数翻译', () => {
  assert.equal(
    translateFixedMessage('zh-CN', 'teacherFallback.afterEdit', {
      keyword: '注意力',
    }),
    '修改后更清楚了。不过“注意力”的机制，你能再具体说说吗？',
  );
  assert.equal(
    translateFixedMessage('en', 'teacherFallback.afterEdit', {
      keyword: 'attention',
    }),
    'Clearer now. But the mechanism of "attention" — could you say more?',
  );
});

test('补一句老师回应应支持中英文嵌套占位符', () => {
  const chineseQuestion = translateFixedMessage(
    'zh-CN',
    'teacherFallback.activeOrDriven',
  );
  const englishQuestion = translateFixedMessage(
    'en',
    'teacherFallback.activeOrDriven',
  );

  assert.equal(
    translateFixedMessage('zh-CN', 'teacherFallback.afterAppend', {
      question: chineseQuestion,
    }),
    '你把刚才的想法补进来了。那么分配是主动的，还是被任务牵引的？',
  );
  assert.equal(
    translateFixedMessage('en', 'teacherFallback.afterAppend', {
      question: englishQuestion,
    }),
    "You've added that thought. So then, is the allocation active, or driven by the task?",
  );
});

test('缺失的插值参数应保留占位符以暴露错误', () => {
  assert.equal(
    translateFixedMessage('en', 'teacherFallback.firstQuestion'),
    'When you wrote "{keyword}", what did you mean? Could you say a bit more?',
  );
});
