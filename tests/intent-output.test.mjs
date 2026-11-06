import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IntentRouterError,
  parseIntentOutput,
} from '../src/main/services/validators/intent-output.ts';

test('intent validator 应解析 research 并清洗查询', () => {
  assert.deepEqual(
    parseIntentOutput(
      JSON.stringify({
        mode: 'research',
        queries: [' 认知负荷 ', '认知负荷', 'cognitive load', 'a', 'b'],
        reason: '需要外部定义。',
      }),
    ),
    {
      mode: 'research',
      queries: ['认知负荷', 'cognitive load', 'a'],
      reason: '需要外部定义。',
    },
  );
});

test('intent validator 对 reflect 应清空查询', () => {
  assert.deepEqual(
    parseIntentOutput(
      JSON.stringify({ mode: 'reflect', queries: ['ignored'] }),
    ),
    { mode: 'reflect', queries: [] },
  );
});

test('intent validator 应容忍代码围栏', () => {
  assert.deepEqual(
    parseIntentOutput(
      `\`\`\`json\n${JSON.stringify({
        mode: 'research',
        queries: ['定义'],
      })}\n\`\`\``,
    ),
    { mode: 'research', queries: ['定义'] },
  );
});

test('intent validator 应拒绝非法 JSON、模式和对象', () => {
  for (const raw of [
    'not json',
    JSON.stringify({ mode: 'unknown', queries: [] }),
    JSON.stringify([]),
  ]) {
    assert.throws(
      () => parseIntentOutput(raw),
      (error) => error instanceof IntentRouterError,
    );
  }
});

test('intent validator 应截断查询和 reason', () => {
  const result = parseIntentOutput(
    JSON.stringify({
      mode: 'research',
      queries: ['长'.repeat(200)],
      reason: '理'.repeat(350),
    }),
  );

  assert.equal([...result.queries[0]].length, 120);
  assert.equal([...result.reason].length, 300);
});
