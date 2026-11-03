import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PROMPT_CATALOG,
  PROMPT_VERSION,
  buildMaintenanceTeacherMessages,
  buildResumeTeacherMessages,
  buildTeacherMessages,
  composeTeacherMessages,
} from '../src/main/prompts/index.ts';

const promptPage = {
  id: 1,
  title: '注意力与带宽',
  body: '注意力是一种有限资源。',
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 1,
  messages: [
    { role: 'user', text: '旧想法。', requestId: 'u1' },
    { role: 'teacher', text: '旧问题？', requestId: 't1' },
    { role: 'user', text: '我的当前问题。', requestId: 'u2' },
  ],
};

const contextPage = {
  ...promptPage,
  id: 2,
  title: '有限的注意力',
  body: '注意力需要主动分配。',
  status: 'closed',
  messages: [{ role: 'user', text: '上下文想法。', requestId: 'c1' }],
};

const targetPage = {
  ...promptPage,
  id: 3,
  title: '注意力与任务',
  body: '任务会牵引注意力。',
  messages: [{ role: 'user', text: '目标页想法。', requestId: 'g1' }],
};

const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const collectStrings = (value) =>
  typeof value === 'string'
    ? [value]
    : Object.values(value).flatMap((entry) => collectStrings(entry));

test('Prompt Catalog 应包含版本和全部非空提示词', () => {
  assert.match(PROMPT_VERSION, /^teacher-v\d+\.\d+\.\d+$/);
  assert.ok(PROMPT_CATALOG.teacher.system.trim());
  assert.ok(PROMPT_CATALOG.teacher.resume.trim());
  assert.ok(PROMPT_CATALOG.teacher.maintenance.trim());
  assert.ok(PROMPT_CATALOG.teacher.context.currentPage.trim());
  assert.ok(PROMPT_CATALOG.teacher.context.closedPage.trim());
  assert.ok(PROMPT_CATALOG.teacher.context.targetPage.trim());
  assert.ok(PROMPT_CATALOG.teacher.maintenanceAction.edit.trim());
  assert.ok(PROMPT_CATALOG.teacher.maintenanceAction.append.trim());
  assert.ok(PROMPT_CATALOG.provider.connectionTest.trim());

  for (const prompt of collectStrings(PROMPT_CATALOG)) {
    assert.ok(prompt.trim(), 'Catalog 中不应存在空提示词');
  }
});

test('Prompt 迁移后应保持既有消息内容指纹', () => {
  const messages = {
    ask: buildTeacherMessages({
      page: promptPage,
      userText: '我的当前问题。',
      replyLanguage: 'zh-CN',
    }),
    resume: buildResumeTeacherMessages({
      page: targetPage,
      contextPage,
      userText: '上下文想法。',
      replyLanguage: 'zh-CN',
    }),
    edit: buildMaintenanceTeacherMessages({
      page: promptPage,
      userText: '修改后的想法。',
      replyLanguage: 'zh-CN',
      maintenanceKind: 'edit',
    }),
    append: buildMaintenanceTeacherMessages({
      page: promptPage,
      userText: '补充的想法。',
      replyLanguage: 'zh-CN',
      maintenanceKind: 'append',
    }),
  };

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(messages).map(([name, value]) => [name, digest(value)]),
    ),
    {
      ask: 'ed4537617a1bddae95adabb80b931c520651189244811bb30efd34de6b183e12',
      resume:
        '650629c8b83088553c26acdb773f5c1c566f161941bd1ea6db7434e535ca370c',
      edit: 'b6fd4f92c48eeef4d044f2020d3826438f6164126226657697e0864c1e8fd940',
      append:
        'ff69079d8e0ec09dd78f02fb945d9b24f3caea4fd661c3b87fdf24329c87aae8',
    },
  );
  assert.equal(
    digest([
      {
        role: 'user',
        content: PROMPT_CATALOG.provider.connectionTest,
      },
    ]),
    '69d250c1c6dbbb879b9ab15b1ad444b609af74b2878014992c313b18ec31ca15',
  );
});

test('模式组装入口应保持现有模式优先级', () => {
  const input = {
    page: targetPage,
    contextPage,
    userText: '目标页想法。',
    replyLanguage: 'zh-CN',
  };

  assert.deepEqual(
    composeTeacherMessages(input),
    buildResumeTeacherMessages(input),
  );
  assert.deepEqual(
    composeTeacherMessages({
      ...input,
      userText: '修改后的想法。',
      maintenanceKind: 'edit',
    }),
    buildMaintenanceTeacherMessages({
      ...input,
      userText: '修改后的想法。',
      maintenanceKind: 'edit',
    }),
  );
  assert.deepEqual(
    composeTeacherMessages({
      page: promptPage,
      userText: '当前想法。',
    }),
    buildTeacherMessages({
      page: promptPage,
      userText: '当前想法。',
    }),
  );
});

test('业务服务文件不得重新写入模型提示词原文', async () => {
  const files = [
    new URL('../src/main/services/model-teacher.ts', import.meta.url),
    new URL('../src/main/services/provider-connection.ts', import.meta.url),
  ];
  const forbiddenFragments = [
    'You are the companion teacher',
    'Continue the companion dialogue',
    'The user has just updated the current page',
    'The following is the current study page',
    'The following is the recently closed context page',
    'The following is the current target page',
    'The user edited the current note',
    'The user appended a new thought',
    'Reply with OK.',
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');

    for (const fragment of forbiddenFragments) {
      assert.equal(
        source.includes(fragment),
        false,
        `${file.pathname} 不应包含散落提示词：${fragment}`,
      );
    }
  }
});
