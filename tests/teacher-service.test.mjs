import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  allocateDatabasePath,
  closeDatabase,
  openDatabase,
} from '../src/main/db/client.ts';
import { PagesRepository } from '../src/main/db/pages.ts';
import {
  TeacherService,
  createMockTeacherStream,
} from '../src/main/services/teacher.ts';

const createTeacherFixture = async (t, generator) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-teacher-'));
  const db = openDatabase(allocateDatabasePath(directory));
  const repository = new PagesRepository(db);
  const page = repository.create('注意力像带宽。', '课程');

  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });

  return {
    page,
    repository,
    service: new TeacherService(repository, generator),
  };
};

test('老师服务应流式返回并持久化完整问答', async (t) => {
  const { page, repository, service } = await createTeacherFixture(
    t,
    async function* () {
      yield '第一段';
      yield '第二段';
    },
  );
  const events = [];
  const outcome = service.start(
    { pageId: page.id, userText: '我的回答。', requestId: 'request-1' },
    (event) => events.push(event),
  );

  assert.equal(outcome.result.ok, true);
  const done = await outcome.completion;

  assert.equal(done.ok, true);
  assert.equal(done.reply, '第一段第二段');
  assert.deepEqual(events.slice(0, 2), [
    { pageId: page.id, requestId: 'request-1', chunk: '第一段' },
    { pageId: page.id, requestId: 'request-1', chunk: '第二段' },
  ]);
  assert.deepEqual(events[2], done);

  const savedPage = repository.findById(page.id);
  assert.equal(savedPage.teachingRoundCount, 1);
  assert.equal(savedPage.messages[0].role, 'user');
  assert.equal(savedPage.messages[0].text, '我的回答。');
  assert.equal(savedPage.messages[1].role, 'teacher');
  assert.equal(savedPage.messages[1].text, '第一段第二段');
});

test('相同请求编号不应启动重复老师回应', async (t) => {
  let calls = 0;
  const { page, repository, service } = await createTeacherFixture(
    t,
    async function* () {
      calls += 1;
      await Promise.resolve();
      yield '只回应一次';
    },
  );
  const payload = {
    pageId: page.id,
    userText: '重复提交。',
    requestId: 'same-request',
  };

  const first = service.start(payload, () => {});
  const second = service.start(payload, () => {});
  await first.completion;

  assert.equal(calls, 1);
  assert.equal(second.completion, undefined);
  assert.equal(repository.findById(page.id).messages.length, 2);
});

test('老师生成失败时应保留用户消息并发送失败事件', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { page, repository, service } = await createTeacherFixture(
    t,
    async function* () {
      yield '';
      throw new Error('模型不可用');
    },
  );
  const events = [];
  const outcome = service.start(
    { pageId: page.id, userText: '保留这一句。', requestId: 'failed-1' },
    (event) => events.push(event),
  );
  const done = await outcome.completion;

  assert.equal(done.ok, false);
  assert.equal(done.error, '老师暂时没应声。');
  assert.equal(events.at(-1).ok, false);

  const savedPage = repository.findById(page.id);
  assert.equal(savedPage.messages.length, 1);
  assert.equal(savedPage.messages[0].text, '保留这一句。');
  assert.equal(savedPage.teachingRoundCount, 0);
});

test('老师空流应返回失败且不增加轮次', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { page, repository, service } = await createTeacherFixture(
    t,
    async function* () {
      yield '';
    },
  );
  const outcome = service.start(
    { pageId: page.id, userText: '空回应。', requestId: 'empty-1' },
    () => {},
  );
  const done = await outcome.completion;

  assert.equal(done.ok, false);
  assert.equal(repository.findById(page.id).teachingRoundCount, 0);
});

test('开始写入失败时应直接返回失败', async (t) => {
  t.mock.method(console, 'error', () => {});
  const service = new TeacherService(
    {
      beginTeacherTurn() {
        throw new Error('写入失败');
      },
      completeTeacherTurn() {
        return null;
      },
    },
    async function* () {
      yield '不会执行';
    },
  );

  assert.deepEqual(
    service.start(
      { pageId: 1, userText: '笔记', requestId: 'write-failed' },
      () => {},
    ).result,
    {
      ok: false,
      requestId: 'write-failed',
      error: '老师暂时没应声。',
    },
  );
});

test('已完成请求不应再次启动生成', () => {
  const completedPage = {
    id: 1,
    title: '已完成',
    body: '笔记',
    source: '',
    status: 'reading',
    parseStatus: 'pending',
    teachingRoundCount: 1,
    messages: [
      {
        role: 'teacher',
        text: '已经回应',
        requestId: 'completed-1',
      },
    ],
  };
  const service = new TeacherService(
    {
      beginTeacherTurn() {
        return completedPage;
      },
      completeTeacherTurn() {
        throw new Error('不应执行');
      },
    },
    async function* () {
      yield '';
      throw new Error('不应执行');
    },
  );

  const outcome = service.start(
    { pageId: 1, userText: '笔记', requestId: 'completed-1' },
    () => {},
  );

  assert.deepEqual(outcome.result, { ok: true, requestId: 'completed-1' });
  assert.equal(outcome.completion, undefined);
});

test('完成消息无法写入时应发送失败事件', async (t) => {
  t.mock.method(console, 'error', () => {});
  const page = {
    id: 1,
    title: '写入失败',
    body: '笔记',
    source: '',
    status: 'reading',
    parseStatus: 'pending',
    teachingRoundCount: 0,
    messages: [{ role: 'user', text: '回答' }],
  };
  const service = new TeacherService(
    {
      beginTeacherTurn() {
        return page;
      },
      completeTeacherTurn() {
        return null;
      },
    },
    async function* () {
      yield '老师回应';
    },
  );
  const events = [];
  const outcome = service.start(
    { pageId: 1, userText: '回答', requestId: 'complete-failed' },
    (event) => events.push(event),
  );
  const done = await outcome.completion;

  assert.equal(done.ok, false);
  assert.equal(events.at(-1).ok, false);
});

test('老师服务应拒绝无效请求和不存在的页边', async (t) => {
  const { service } = await createTeacherFixture(t, async function* () {
    yield '不会执行';
  });

  for (const payload of [
    null,
    {},
    { pageId: 0, userText: '笔记', requestId: 'request' },
    { pageId: 1, userText: ' ', requestId: 'request' },
    { pageId: 1, userText: '笔记', requestId: '' },
  ]) {
    assert.equal(service.start(payload, () => {}).result.ok, false);
  }

  assert.deepEqual(
    service.start(
      { pageId: 999, userText: '笔记', requestId: 'missing' },
      () => {},
    ).result,
    {
      ok: false,
      requestId: 'missing',
      error: '这一页没有找到。',
    },
  );
});

test('本地老师流应逐块输出并在聊透后建议合上', async () => {
  const page = {
    id: 1,
    title: '注意力',
    body: '注意力像带宽。',
    source: '课程',
    status: 'reading',
    parseStatus: 'pending',
    teachingRoundCount: 3,
    messages: [],
  };
  const chunks = [];

  for await (const chunk of createMockTeacherStream({
    page,
    userText: '我的理解。',
    replyLanguage: 'zh-CN',
  })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.length > 2);
  assert.match(chunks.join(''), /合上这页/);
});

test('本地老师流应针对首轮生成叩问', async () => {
  const page = {
    id: 1,
    title: '注意力',
    body: '注意力像带宽。',
    source: '课程',
    status: 'reading',
    parseStatus: 'pending',
    teachingRoundCount: 0,
    messages: [],
  };
  const chunks = [];

  for await (const chunk of createMockTeacherStream({
    page,
    userText: '我的理解。',
    replyLanguage: 'zh-CN',
  })) {
    chunks.push(chunk);
  }

  assert.match(chunks.join(''), /由谁决定/);
});

test('本地老师应按最新英文用户消息输出英文', async (t) => {
  const { page, service } = await createTeacherFixture(t, undefined);
  const outcome = service.start(
    {
      pageId: page.id,
      userText: 'What does attention allocation mean?',
      requestId: 'english-1',
    },
    () => {},
  );
  const done = await outcome.completion;

  assert.equal(done.ok, true);
  assert.match(done.reply, /If that's what you mean/);
  assert.doesNotMatch(done.reply, /如果按你说的/);
});

test('同一会话中途切换语言时应跟随最新用户消息', async (t) => {
  const { page, service } = await createTeacherFixture(t, undefined);
  const first = service.start(
    {
      pageId: page.id,
      userText: 'My first thought is in English.',
      requestId: 'switch-1',
    },
    () => {},
  );
  const firstDone = await first.completion;
  assert.match(firstDone.reply, /If that's what you mean/);

  const second = service.start(
    {
      pageId: page.id,
      userText: '现在改用中文继续提问。',
      requestId: 'switch-2',
    },
    () => {},
  );
  const secondDone = await second.completion;
  assert.match(secondDone.reply, /分配完之后/);
  assert.doesNotMatch(secondDone.reply, /After that allocation/);
});

test('中英文混合问题应优先使用中文老师回复', async (t) => {
  const { page, service } = await createTeacherFixture(t, undefined);
  const outcome = service.start(
    {
      pageId: page.id,
      userText: '请用 English 解释这个 attention 问题。',
      requestId: 'mixed-1',
    },
    () => {},
  );
  const done = await outcome.completion;

  assert.match(done.reply, /如果按你说的/);
  assert.doesNotMatch(done.reply, /If that's what you mean/);
});
