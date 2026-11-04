import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveAnchorQuote } from '../src/main/services/anchor-quote.ts';

test('应提取中文最长公共片段并保留原文', () => {
  assert.equal(
    deriveAnchorQuote('注意力是一种有限资源。', '注意力需要主动分配。'),
    '注意力',
  );
  assert.equal(
    deriveAnchorQuote('工作记忆的容量决定认知负荷。', '认知负荷来自工作记忆。'),
    '工作记忆',
  );
});

test('英文匹配应忽略大小写但返回当前念头的写法', () => {
  assert.equal(
    deriveAnchorQuote(
      'Attention is a limited resource.',
      'attention is limited.',
    ),
    'Attention is',
  );
});

test('不足 3 字或没有公共片段时不应生成锚点', () => {
  assert.equal(deriveAnchorQuote('注意力。', '注意。'), undefined);
  assert.equal(
    deriveAnchorQuote('完全不同的内容。', '另一段文字。'),
    undefined,
  );
  assert.equal(deriveAnchorQuote('', '注意力'), undefined);
  assert.equal(deriveAnchorQuote('注意力', ''), undefined);
});

test('锚点应压缩空白、去掉换行并限制在 40 字内', () => {
  const long = '这是一段很长很长的公共文本'.repeat(10);
  const quote = deriveAnchorQuote(long, long);

  assert.ok(quote);
  assert.equal(quote.includes('\n'), false);
  assert.ok(quote.length <= 40);

  assert.equal(
    deriveAnchorQuote('第一行\n注意力是有限资源', '第一行\n注意力'),
    '第一行 注意力',
  );
});
