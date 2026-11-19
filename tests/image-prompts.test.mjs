import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMaintenanceTeacherMessages,
  buildResumeTeacherMessages,
  buildTeacherMessages,
} from '../src/main/prompts/teacher-messages.ts';
import { buildGuidanceMessages } from '../src/main/prompts/guidance.ts';
import {
  buildIntentRouterMessages,
  buildResearchMessages,
} from '../src/main/prompts/research.ts';
import { buildPageImagesMessage } from '../src/main/prompts/teacher-context.ts';

const imageDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '图文正文' },
        { type: 'noteImage', attrs: { imageId: 'image-1' } },
      ],
    },
  ],
};

const page = {
  id: 1,
  title: '图文念头',
  body: '图文正文',
  doc: imageDoc,
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 0,
  messages: [],
};

const contextPage = {
  ...page,
  id: 2,
  title: '上下文念头',
  body: '上下文正文',
  doc: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '上下文正文' },
          { type: 'noteImage', attrs: { imageId: 'image-2' } },
        ],
      },
    ],
  },
};

test('当前页图片应作为附加 user 消息带上', () => {
  const messages = buildTeacherMessages({ page, userText: '为什么？' });
  const imageMessages = messages.filter((message) => message.imageContext);

  assert.equal(imageMessages.length, 1);
  assert.equal(imageMessages[0].role, 'user');
  assert.deepEqual(imageMessages[0].imageIds, ['image-1']);
});

test('维护请求应带当前页图片', () => {
  const messages = buildMaintenanceTeacherMessages({
    page,
    userText: '编辑后的正文',
    maintenanceKind: 'edit',
  });
  const imageMessages = messages.filter((message) => message.imageContext);

  assert.equal(imageMessages.length, 1);
  assert.deepEqual(imageMessages[0].imageIds, ['image-1']);
});

test('恢复请求应带目标页和上下文页图片', () => {
  const messages = buildResumeTeacherMessages({
    page,
    contextPage,
    userText: '继续',
  });
  const imageMessages = messages.filter((message) => message.imageContext);

  assert.equal(imageMessages.length, 2);
  assert.deepEqual(
    imageMessages.map((message) => message.imageIds),
    [['image-1'], ['image-2']],
  );
});

test('引导、意图和研究应把当前页图片挂到 user 消息', () => {
  const guidance = buildGuidanceMessages({ page, candidates: [] });
  const intent = buildIntentRouterMessages({ page, userText: '这是事实吗？' });
  const research = buildResearchMessages({
    page,
    userText: '这是事实吗？',
    evidence: [],
  });

  assert.deepEqual(guidance.at(-1).imageIds, ['image-1']);
  assert.deepEqual(intent.at(-1).imageIds, ['image-1']);
  assert.deepEqual(research.at(-1).imageIds, ['image-1']);
});

test('无图页面不应插图片消息或 imageIds', () => {
  const plainPage = { ...page, doc: undefined };

  assert.equal(buildPageImagesMessage(plainPage, 'the current note'), null);
  assert.equal(
    buildTeacherMessages({ page: plainPage, userText: '问题' }).some(
      (message) => message.imageContext,
    ),
    false,
  );
  assert.equal(
    buildGuidanceMessages({ page: plainPage, candidates: [] }).at(-1).imageIds,
    undefined,
  );
});
