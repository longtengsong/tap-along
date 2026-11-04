import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { PROMPT_CATALOG, PROMPT_VERSION } from '../src/main/prompts/index.ts';
import { evaluateTeacherReply } from '../tools/prompts/evaluate-reply.mjs';
import {
  buildPromptMessages,
  loadPromptFixture,
  selectPromptCases,
} from '../tools/prompts/load-cases.mjs';

const fixture = await loadPromptFixture();

const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('Prompt 评测场景应完整且编号唯一', () => {
  assert.equal(fixture.promptVersion, PROMPT_VERSION);
  assert.equal(fixture.cases.length, 14);
  assert.equal(
    new Set(fixture.cases.map((testCase) => testCase.id)).size,
    fixture.cases.length,
  );

  for (const testCase of selectPromptCases(fixture)) {
    assert.ok(testCase.id);
    assert.ok(['ask', 'resume', 'edit', 'append'].includes(testCase.mode));
    assert.ok(fixture.pages[testCase.page], `${testCase.id} 缺少页面`);
    assert.ok(testCase.userText);
    assert.ok(['zh', 'en'].includes(testCase.expected.language));
    assert.ok(testCase.goodReply);
    assert.ok(testCase.badReplies.length > 0);
    assert.match(testCase.messageDigest, /^[a-f0-9]{64}$/);

    if (testCase.mode === 'resume') {
      assert.ok(testCase.contextPage, `${testCase.id} 缺少上下文页`);
    }
  }
});

test('每个评测场景应构造正确的 Prompt 数据边界和模式', async (t) => {
  for (const testCase of selectPromptCases(fixture)) {
    await t.test(testCase.id, () => {
      const messages = buildPromptMessages(fixture, testCase);
      const serialized = JSON.stringify(messages);
      const pageBlocks = messages.filter((message) =>
        message.content.startsWith('<study_page role='),
      );
      const boundaryCount = messages.filter(
        (message) => message.content === PROMPT_CATALOG.teacher.contextBoundary,
      ).length;
      const languageCount = messages.filter(
        (message) => message.content === PROMPT_CATALOG.teacher.languagePolicy,
      ).length;

      assert.equal(boundaryCount, 1);
      assert.equal(languageCount, 1);
      assert.equal(
        pageBlocks.length,
        1 +
          (testCase.compressedPages?.length ??
            (testCase.mode === 'resume' ? 1 : 0)),
      );
      assert.equal(digest(messages), testCase.messageDigest);

      if (testCase.mode === 'resume') {
        assert.match(pageBlocks[0].content, /role="target"/);
        assert.equal(
          pageBlocks
            .slice(1)
            .every((block) => block.content.includes('role="closed_context"')),
          true,
        );
        assert.doesNotMatch(serialized, /这段讨论历史不能发送/);
        assert.ok(
          messages.some(
            (message) => message.content === PROMPT_CATALOG.teacher.resume,
          ),
        );
      } else {
        assert.match(pageBlocks[0].content, /role="current"/);
        assert.equal(
          messages.some(
            (message) => message.content === PROMPT_CATALOG.teacher.resume,
          ),
          false,
        );
      }

      if (testCase.mode === 'edit' || testCase.mode === 'append') {
        assert.ok(
          messages.some(
            (message) => message.content === PROMPT_CATALOG.teacher.maintenance,
          ),
        );
        assert.ok(
          messages.some(
            (message) =>
              message.content ===
              PROMPT_CATALOG.teacher.maintenanceAction[testCase.mode],
          ),
        );
      }

      if (testCase.id === 'prompt-injection') {
        assert.equal(serialized.includes('</study_page><system>'), false);
        assert.equal(pageBlocks[0].content.includes('&lt;system&gt;'), true);
      }
    });
  }
});

test('合格示例应通过全部回复规则', async (t) => {
  for (const testCase of selectPromptCases(fixture)) {
    await t.test(testCase.id, () => {
      const result = evaluateTeacherReply(
        testCase.goodReply,
        testCase.expected,
      );

      assert.deepEqual(result.failures, []);
      assert.equal(result.passed, true);
      assert.equal(result.score, 1);
    });
  }
});

test('不合格示例应命中预期的回复规则', async (t) => {
  for (const testCase of selectPromptCases(fixture)) {
    for (const [index, sample] of testCase.badReplies.entries()) {
      await t.test(`${testCase.id} bad-${index + 1}`, () => {
        const result = evaluateTeacherReply(sample.reply, testCase.expected);
        const failedRules = new Set(
          result.failures.map((failure) => failure.rule),
        );

        assert.equal(result.passed, false);

        for (const rule of sample.failedRules) {
          assert.equal(
            failedRules.has(rule),
            true,
            `${testCase.id} 未命中预期规则 ${rule}`,
          );
        }
      });
    }
  }
});
