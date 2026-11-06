import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GuidanceOutputError,
  parseGuidanceOutput,
} from '../src/main/services/validators/guidance-output.ts';

const candidates = [
  { pageId: 12, title: '注意力与任务', source: '课程', body: '正文' },
  { pageId: 18, title: '任务牵引', source: '日记', body: '正文' },
];

const decision = {
  needDeeperUnderstanding: true,
  reason: '两页都在讨论注意力。',
  suggestions: [
    {
      relatedPageIds: [12, 18],
      why: '一页讲分配，一页讲牵引。',
      question: '注意力和任务牵引如何一起影响分配？',
    },
  ],
};

test('guidance validator 应解析合法输出并保留候选 id', () => {
  assert.deepEqual(
    parseGuidanceOutput(JSON.stringify(decision), candidates),
    decision,
  );
});

test('guidance validator 应容忍代码围栏并截断 reason', () => {
  const longReason = '长'.repeat(350);
  const result = parseGuidanceOutput(
    `\`\`\`json\n${JSON.stringify({ ...decision, reason: longReason })}\n\`\`\``,
    candidates,
  );

  assert.equal([...result.reason].length, 300);
});

test('guidance validator 应拒绝未知、重复和超量 id', () => {
  for (const relatedPageIds of [
    [999],
    [12, 12],
    [12, 18, 12],
    [12, 13, 14, 15, 16],
  ]) {
    assert.throws(
      () =>
        parseGuidanceOutput(
          JSON.stringify({
            ...decision,
            suggestions: [{ ...decision.suggestions[0], relatedPageIds }],
          }),
          candidates,
        ),
      (error) => error instanceof GuidanceOutputError,
    );
  }
});

test('guidance validator 应丢弃非法问题，并在需要深挖时抛错', () => {
  for (const question of [
    '没有问号',
    '第一行？\n第二行',
    `${'长'.repeat(161)}？`,
  ]) {
    assert.throws(
      () =>
        parseGuidanceOutput(
          JSON.stringify({
            ...decision,
            suggestions: [{ ...decision.suggestions[0], question }],
          }),
          candidates,
        ),
      (error) => error instanceof GuidanceOutputError,
    );
  }
});

test('guidance validator 在不需要深挖时应清空 suggestions', () => {
  assert.deepEqual(
    parseGuidanceOutput(
      JSON.stringify({
        needDeeperUnderstanding: false,
        suggestions: decision.suggestions,
      }),
      candidates,
    ),
    { needDeeperUnderstanding: false, suggestions: [] },
  );
});

test('guidance validator 应拒绝非法 JSON 和非对象', () => {
  for (const raw of ['no json', '[]', 'null']) {
    assert.throws(
      () => parseGuidanceOutput(raw, candidates),
      (error) => error instanceof GuidanceOutputError,
    );
  }
});
