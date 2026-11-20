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
  createOpeningTeacherMessage,
  createMockTeacherStream,
} from '../src/main/services/teacher.ts';
import {
  createModelAwareTeacherStream,
  ProviderRequestError,
} from '../src/main/services/model-teacher.ts';
import {
  composeTeacherMessages,
  PROMPT_CATALOG,
} from '../src/main/prompts/index.ts';

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

test('普通问答应使用激活模型流并只持久化一次完整回复', async (t) => {
  const encoder = new TextEncoder();
  const generator = createModelAwareTeacherStream({
    configService: {
      resolveActive: async () => ({
        ok: true,
        config: {
          id: 'custom',
          baseUrl: 'https://models.example.com/v1',
          model: 'reading-model',
          apiKey: 'sk-integration-private-key',
        },
      }),
    },
    fallback: async function* () {
      yield '不应使用本地回退';
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"模型"}}]}\n\n',
            ),
          );
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"问题？"}}]}\n\n',
            ),
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    }),
  });
  const { page, repository, service } = await createTeacherFixture(
    t,
    generator,
  );
  const events = [];
  const outcome = service.start(
    {
      pageId: page.id,
      userText: '请继续追问。',
      requestId: 'model-request',
    },
    (event) => events.push(event),
  );
  const done = await outcome.completion;

  assert.equal(done.ok, true);
  assert.equal(done.reply, '模型问题？');
  assert.deepEqual(
    events.slice(0, 2).map((event) => event.chunk),
    ['模型', '问题？'],
  );

  const savedPage = repository.findById(page.id);
  const teacherMessages = savedPage.messages.filter(
    (message) => message.role === 'teacher',
  );
  assert.equal(savedPage.teachingRoundCount, 1);
  assert.equal(teacherMessages.length, 1);
  assert.equal(teacherMessages[0].text, '模型问题？');
  assert.equal(teacherMessages[0].requestId, 'model-request');
});

test('跨页回问应使用激活模型生成问题并保留目标页轮次', async (t) => {
  const encoder = new TextEncoder();
  let requestOptions;
  const generator = createModelAwareTeacherStream({
    configService: {
      resolveActive: async () => ({
        ok: true,
        config: {
          id: 'custom',
          baseUrl: 'https://models.example.com/v1',
          model: 'reading-model',
          apiKey: 'sk-resume-private-key',
        },
      }),
    },
    fallback: async function* () {
      yield '不应使用本地回退';
    },
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return {
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"两页之间有什么联系？"}}]}\n\n',
              ),
            );
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
      };
    },
  });
  const { page, repository, service } = await createTeacherFixture(
    t,
    generator,
  );
  const contextPage = repository.create('注意力需要主动分配。', '上一页课程');
  repository.closePage(contextPage.id, 'close-model-context');
  const events = [];
  const outcome = service.startResume(
    {
      targetPageId: page.id,
      contextPageId: contextPage.id,
      requestId: 'model-resume',
    },
    (event) => events.push(event),
  );
  const done = await outcome.completion;

  assert.equal(done.ok, true);
  assert.equal(done.reply, '两页之间有什么联系？');
  const requestBody = JSON.parse(requestOptions.body);
  assert.equal(requestBody.messages[2].content, PROMPT_CATALOG.teacher.resume);
  assert.match(JSON.stringify(requestBody.messages), /注意力需要主动分配/);
  assert.match(JSON.stringify(requestBody.messages), /注意力像带宽/);
  assert.equal(requestOptions.body.includes('sk-resume-private-key'), false);

  const savedTarget = repository.findById(page.id);
  const teacherMessages = savedTarget.messages.filter(
    (message) => message.role === 'teacher',
  );
  assert.equal(savedTarget.teachingRoundCount, 0);
  assert.equal(teacherMessages.length, 1);
  assert.equal(teacherMessages[0].text, '两页之间有什么联系？');
  assert.equal(teacherMessages[0].requestId, 'model-resume');
  assert.equal(events.at(-1).ok, true);
});

test('多层页叠应在后续请求中持续携带后代正文且不发送讨论', async (t) => {
  const encoder = new TextEncoder();
  const requestBodies = [];
  const generator = createModelAwareTeacherStream({
    configService: {
      resolveActive: async () => ({
        ok: true,
        config: {
          id: 'custom',
          baseUrl: 'https://models.example.com/v1',
          model: 'reading-model',
          apiKey: 'sk-lineage-private-key',
        },
      }),
    },
    fallback: async function* () {
      yield '不应使用本地回退';
    },
    fetchImpl: async (_url, options) => {
      requestBodies.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"模型问题？"}}]}\n\n',
              ),
            );
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
      };
    },
  });
  const {
    page: pageA,
    repository,
    service,
  } = await createTeacherFixture(t, generator);
  const pageB = repository.create(
    'B 的正文。',
    'B 来源秘密',
    undefined,
    pageA.id,
  );
  repository.beginTeacherTurn(pageB.id, 'B 用户讨论秘密。', 'b-user');
  repository.completeTeacherTurn(pageB.id, 'B 老师讨论秘密？', false, 'b-user');
  const pageC = repository.create(
    'C 的正文。',
    'C 来源秘密',
    undefined,
    pageB.id,
  );
  repository.beginTeacherTurn(pageC.id, 'C 用户讨论秘密。', 'c-user');
  repository.completeTeacherTurn(pageC.id, 'C 老师讨论秘密？', false, 'c-user');
  repository.closePage(pageC.id, 'close-lineage-c');
  repository.closePage(pageB.id, 'close-lineage-b');

  const resume = service.startResume(
    {
      targetPageId: pageA.id,
      contextPageId: pageB.id,
      requestId: 'lineage-resume',
    },
    () => {},
  );
  await resume.completion;

  const ask = service.start(
    {
      pageId: pageA.id,
      userText: '继续讨论 A。',
      requestId: 'lineage-ask',
    },
    () => {},
  );
  await ask.completion;

  const edit = service.startMaintenance(
    {
      pageId: pageA.id,
      kind: 'edit',
      triggerText: 'A 的修改内容。',
      requestId: 'lineage-edit',
    },
    () => {},
  );
  await edit.completion;

  const append = service.startMaintenance(
    {
      pageId: pageA.id,
      kind: 'append',
      triggerText: 'A 的补充内容。',
      requestId: 'lineage-append',
    },
    () => {},
  );
  await append.completion;

  assert.equal(requestBodies.length, 4);

  for (const requestBody of requestBodies) {
    const serialized = JSON.stringify(requestBody.messages);
    const compressedBlocks = requestBody.messages.filter((message) =>
      message.content.startsWith('<study_page role="closed_context"'),
    );

    assert.equal(compressedBlocks.length, 2);
    assert.match(serialized, /B 的正文/);
    assert.match(serialized, /C 的正文/);
    assert.doesNotMatch(serialized, /B 用户讨论秘密/);
    assert.doesNotMatch(serialized, /B 老师讨论秘密/);
    assert.doesNotMatch(serialized, /C 用户讨论秘密/);
    assert.doesNotMatch(serialized, /C 老师讨论秘密/);
    assert.doesNotMatch(serialized, /B 来源秘密/);
    assert.doesNotMatch(serialized, /C 来源秘密/);
    assert.equal(
      requestBody.messages.filter(
        (message) =>
          message.content === PROMPT_CATALOG.teacher.compressedContextPolicy,
      ).length,
      1,
    );

    const pageBlockIndex = requestBody.messages.findIndex(
      (message) =>
        message.content.startsWith('<study_page role="target"') ||
        message.content.startsWith('<study_page role="current"'),
    );
    const firstCompressedIndex = requestBody.messages.findIndex((message) =>
      message.content.startsWith('<study_page role="closed_context"'),
    );

    assert.ok(pageBlockIndex >= 0);
    assert.ok(
      firstCompressedIndex > pageBlockIndex,
      '已合上页正文应排在目标页正文之后，而不是内容区最前面',
    );
  }

  // A 在另起 B 时还没有对谈，因此 B、C 的正文应落在 A 历史的最前段，
  // 之后再出现 A 自己的跨页叩问和后续讨论。
  const resumeMessages = requestBodies[0].messages;
  const lastCompressedIndex = resumeMessages.findLastIndex((message) =>
    message.content.startsWith('<study_page role="closed_context"'),
  );
  assert.equal(
    resumeMessages.some(
      (message) =>
        message.role === 'assistant' && message.content.includes('模型问题？'),
    ),
    false,
  );
  assert.ok(lastCompressedIndex > 0);
});

test('编辑和补一句维护应使用激活模型并持久化回应', async (t) => {
  const cases = [
    {
      kind: 'edit',
      triggerText: '修改后的中文想法。',
      prepare: (repository, pageId) =>
        repository.editText(pageId, '修改后的中文想法。', 'model-edit-source'),
      action: /edited the current thought/,
      content: /修改后的中文想法/,
    },
    {
      kind: 'append',
      triggerText: 'This is an appended English thought.',
      prepare: (repository, pageId) =>
        repository.appendText(
          pageId,
          'This is an appended English thought.',
          'model-append-source',
        ),
      action: /appended a new thought/,
      content: /appended English thought/,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.kind, async (t) => {
      const encoder = new TextEncoder();
      let requestOptions;
      const generator = createModelAwareTeacherStream({
        configService: {
          resolveActive: async () => ({
            ok: true,
            config: {
              id: 'custom',
              baseUrl: 'https://models.example.com/v1',
              model: 'reading-model',
              apiKey: `sk-maintenance-${scenario.kind}`,
            },
          }),
        },
        fallback: async function* () {
          yield '不应使用本地回退';
        },
        fetchImpl: async (_url, options) => {
          requestOptions = options;
          return {
            ok: true,
            status: 200,
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(
                  encoder.encode(
                    'data: {"choices":[{"delta":{"content":"维护后的模型问题？"}}]}\n\n',
                  ),
                );
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
              },
            }),
          };
        },
      });
      const { page, repository, service } = await createTeacherFixture(
        t,
        generator,
      );
      scenario.prepare(repository, page.id);
      const events = [];
      const outcome = service.startMaintenance(
        {
          pageId: page.id,
          kind: scenario.kind,
          triggerText: scenario.triggerText,
          requestId: `model-maintenance-${scenario.kind}`,
        },
        (event) => events.push(event),
      );
      const done = await outcome.completion;

      assert.equal(done.ok, true);
      assert.equal(done.reply, '维护后的模型问题？');
      const requestBody = JSON.parse(requestOptions.body);
      assert.equal(
        requestBody.messages[2].content,
        PROMPT_CATALOG.teacher.maintenance,
      );
      assert.match(requestBody.messages[3].content, scenario.action);
      assert.match(JSON.stringify(requestBody.messages), scenario.content);
      assert.deepEqual(requestBody.messages.at(-1), {
        role: 'user',
        content: scenario.triggerText,
      });
      assert.equal(
        requestOptions.body.includes(`sk-maintenance-${scenario.kind}`),
        false,
      );

      const savedPage = repository.findById(page.id);
      const teacherMessages = savedPage.messages.filter(
        (message) =>
          message.role === 'teacher' &&
          message.requestId === `model-maintenance-${scenario.kind}`,
      );
      assert.equal(savedPage.teachingRoundCount, 0);
      assert.equal(teacherMessages.length, 1);
      assert.equal(teacherMessages[0].text, '维护后的模型问题？');
      assert.equal(events.at(-1).ok, true);
    });
  }
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
  assert.equal(done.errorCode, 'TEACHER_NO_RESPONSE');
  assert.equal(events.at(-1).ok, false);

  const savedPage = repository.findById(page.id);
  assert.equal(savedPage.messages.length, 1);
  assert.equal(savedPage.messages[0].text, '保留这一句。');
  assert.equal(savedPage.teachingRoundCount, 0);
});

test('老师服务应向界面传递受控的模型错误码', async (t) => {
  t.mock.method(console, 'error', () => {});

  await t.test('普通问答', async (t) => {
    const errorCode = 'PROVIDER_UNAUTHORIZED';
    const { page, repository, service } = await createTeacherFixture(
      t,
      async function* () {
        yield '';
        throw new ProviderRequestError(errorCode);
      },
    );
    const outcome = service.start(
      { pageId: page.id, userText: '无效密钥测试。', requestId: 'auth-error' },
      () => {},
    );
    const done = await outcome.completion;

    assert.equal(done.errorCode, errorCode);
    assert.equal(repository.findById(page.id).messages.length, 1);
  });

  await t.test('跨页回问', async (t) => {
    const errorCode = 'PROVIDER_RATE_LIMITED';
    const { page, repository, service } = await createTeacherFixture(
      t,
      async function* () {
        yield '';
        throw new ProviderRequestError(errorCode);
      },
    );
    const contextPage = repository.create('上下文页。', '');
    repository.closePage(contextPage.id, 'close-error-context');
    const outcome = service.startResume(
      {
        targetPageId: page.id,
        contextPageId: contextPage.id,
        requestId: 'resume-rate-limit',
      },
      () => {},
    );
    const done = await outcome.completion;

    assert.equal(done.errorCode, errorCode);
    assert.equal(repository.findById(page.id).messages.length, 0);
  });

  await t.test('维护回应', async (t) => {
    const errorCode = 'PROVIDER_REQUEST_FAILED';
    const { page, repository, service } = await createTeacherFixture(
      t,
      async function* () {
        yield '';
        throw new ProviderRequestError(errorCode);
      },
    );
    const outcome = service.startMaintenance(
      {
        pageId: page.id,
        kind: 'append',
        triggerText: '补充内容。',
        requestId: 'maintenance-request-error',
      },
      () => {},
    );
    const done = await outcome.completion;

    assert.equal(done.errorCode, errorCode);
    assert.equal(repository.findById(page.id).teachingRoundCount, 0);
  });
});

test('老师服务应支持幂等取消且不保存部分回应', async (t) => {
  t.mock.method(console, 'error', () => {});

  const exerciseCancellation = async (t, startRequest) => {
    let notifyStarted;
    const started = new Promise((resolve) => {
      notifyStarted = resolve;
    });
    const { page, repository, service } = await createTeacherFixture(
      t,
      async function* ({ signal }) {
        yield '部分回应';
        notifyStarted();
        await new Promise((resolve) => {
          if (signal?.aborted) {
            resolve();
            return;
          }

          signal?.addEventListener('abort', resolve, { once: true });
        });
        yield '取消后的内容';
      },
    );
    const events = [];
    const outcome = startRequest(repository, service, page, events);

    await started;
    assert.deepEqual(service.cancel({ requestId: `cancel-${page.id}` }), {
      ok: true,
    });
    const done = await outcome.completion;

    assert.equal(done.cancelled, true);
    assert.equal(done.reply, undefined);
    assert.equal(done.errorCode, undefined);
    assert.equal(events.at(-1).cancelled, true);
    const savedPage = repository.findById(page.id);
    assert.equal(savedPage.teachingRoundCount, 0);
    assert.equal(
      savedPage.messages.some(
        (message) =>
          message.role === 'teacher' &&
          message.requestId === `cancel-${page.id}`,
      ),
      false,
    );
    assert.deepEqual(service.cancel({ requestId: `cancel-${page.id}` }), {
      ok: true,
    });
  };

  await t.test('普通问答', async (t) => {
    await exerciseCancellation(t, (_repository, service, page, events) =>
      service.start(
        {
          pageId: page.id,
          userText: '需要取消的问题。',
          requestId: `cancel-${page.id}`,
        },
        (event) => events.push(event),
      ),
    );
  });

  await t.test('跨页回问', async (t) => {
    await exerciseCancellation(t, (repository, service, page, events) => {
      const contextPage = repository.create('已合上的上下文。', '');
      repository.closePage(contextPage.id, 'close-cancel-context');

      return service.startResume(
        {
          targetPageId: page.id,
          contextPageId: contextPage.id,
          requestId: `cancel-${page.id}`,
        },
        (event) => events.push(event),
      );
    });
  });

  for (const kind of ['edit', 'append']) {
    await t.test(`维护 ${kind}`, async (t) => {
      await exerciseCancellation(t, (_repository, service, page, events) =>
        service.startMaintenance(
          {
            pageId: page.id,
            kind,
            triggerText: '需要取消的维护内容。',
            requestId: `cancel-${page.id}`,
          },
          (event) => events.push(event),
        ),
      );
    });
  }
});

test('取消请求应校验编号并接受不存在的完成请求', async (t) => {
  const { service } = await createTeacherFixture(t, async function* () {
    yield '';
  });

  for (const payload of [null, {}, { requestId: ' ' }]) {
    assert.deepEqual(service.cancel(payload), {
      ok: false,
      errorCode: 'TEACHER_INVALID_REQUEST',
    });
  }
  assert.deepEqual(service.cancel({ requestId: 'already-finished' }), {
    ok: true,
  });
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
      errorCode: 'TEACHER_NO_RESPONSE',
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
      errorCode: 'TEACHER_PAGE_NOT_FOUND',
    },
  );
});

test('本地老师流应在聊透后建议合上', async () => {
  const page = {
    id: 1,
    title: '注意力',
    body: '注意力像带宽。',
    source: '课程',
    status: 'reading',
    parseStatus: 'pending',
    teachingRoundCount: 6,
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
  assert.match(chunks.join(''), /先想到这/);
});

test('本地老师流在未聊透时不应只按轮数建议合上', async () => {
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
  assert.doesNotMatch(chunks.join(''), /先想到这/);
});

test('用户明确表示收住时本地老师流应提前建议合上', async () => {
  const page = {
    id: 1,
    title: '注意力',
    body: '注意力像带宽。',
    source: '课程',
    status: 'reading',
    parseStatus: 'pending',
    teachingRoundCount: 1,
    messages: [],
  };
  const chunks = [];

  for await (const chunk of createMockTeacherStream({
    page,
    userText: '先收住，差不多想明白了。',
    replyLanguage: 'zh-CN',
  })) {
    chunks.push(chunk);
  }

  assert.match(chunks.join(''), /先想到这/);
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

test('首条老师叩问应跟随笔记正文语言', () => {
  assert.match(
    createOpeningTeacherMessage('注意力像带宽。'),
    /你写的“注意力像带宽”/,
  );
  assert.match(
    createOpeningTeacherMessage('Attention is a limited resource.'),
    /When you wrote "Attention is a limited resource"/,
  );
  assert.match(
    createOpeningTeacherMessage('注意 attention 是有限的。'),
    /你写的“注意atte”/,
  );
});

test('跨页回问应使用已合上页上下文并写入目标页', async (t) => {
  const { page, repository, service } = await createTeacherFixture(
    t,
    undefined,
  );
  const contextPage = repository.create(
    'Attention is a limited resource.',
    'Course',
  );
  repository.closePage(contextPage.id, 'close-context');

  const outcome = service.startResume(
    {
      targetPageId: page.id,
      contextPageId: contextPage.id,
      requestId: 'resume-1',
    },
    () => {},
  );
  const done = await outcome.completion;

  assert.equal(done.ok, true);
  assert.match(
    done.reply,
    /你刚才在“Attention is”里写到“Attention is a limited resource”/,
  );
  assert.doesNotMatch(done.reply, /In "Attention is"/);

  const target = repository.findById(page.id);
  assert.equal(target.teachingRoundCount, 0);
  assert.equal(target.messages.length, 1);
  assert.equal(target.messages[0].role, 'teacher');
  assert.equal(target.messages[0].text, done.reply);
  assert.equal(target.messages[0].requestId, 'resume-1');
});

test('跨页回问应拒绝非法上下文和重复请求', async (t) => {
  const { page, repository, service } = await createTeacherFixture(
    t,
    undefined,
  );
  const openContext = repository.create('尚未合上的页边。', '');

  assert.equal(
    service.startResume(
      {
        targetPageId: page.id,
        contextPageId: page.id,
        requestId: 'same-page',
      },
      () => {},
    ).result.ok,
    false,
  );
  assert.deepEqual(
    service.startResume(
      {
        targetPageId: page.id,
        contextPageId: openContext.id,
        requestId: 'open-context',
      },
      () => {},
    ).result,
    {
      ok: false,
      requestId: 'open-context',
      errorCode: 'TEACHER_INVALID_REQUEST',
    },
  );

  repository.closePage(openContext.id, 'close-open-context');
  const first = service.startResume(
    {
      targetPageId: page.id,
      contextPageId: openContext.id,
      requestId: 'resume-duplicate',
    },
    () => {},
  );
  await first.completion;
  const second = service.startResume(
    {
      targetPageId: page.id,
      contextPageId: openContext.id,
      requestId: 'resume-duplicate',
    },
    () => {},
  );
  assert.equal(second.completion, undefined);
  assert.equal(repository.findById(page.id).messages.length, 1);
});

test('跨页回问应拒绝不存在的页面', async (t) => {
  const { service } = await createTeacherFixture(t, undefined);

  assert.deepEqual(
    service.startResume(
      {
        targetPageId: 999_999,
        contextPageId: 888_888,
        requestId: 'resume-missing',
      },
      () => {},
    ).result,
    {
      ok: false,
      requestId: 'resume-missing',
      errorCode: 'TEACHER_PAGE_NOT_FOUND',
    },
  );
});

test('跨页回问应处理目标已关闭和上下文缺失', async (t) => {
  const { page, repository, service } = await createTeacherFixture(
    t,
    undefined,
  );
  const closedContext = repository.create('已关闭上下文。', '');
  repository.closePage(closedContext.id, 'close-context');

  assert.deepEqual(
    service.startResume(
      {
        targetPageId: 999_999,
        contextPageId: closedContext.id,
        requestId: 'resume-no-target',
      },
      () => {},
    ).result,
    {
      ok: false,
      requestId: 'resume-no-target',
      errorCode: 'TEACHER_PAGE_NOT_FOUND',
    },
  );

  repository.closePage(page.id, 'close-target');
  assert.deepEqual(
    service.startResume(
      {
        targetPageId: page.id,
        contextPageId: closedContext.id,
        requestId: 'resume-closed-target',
      },
      () => {},
    ).result,
    {
      ok: false,
      requestId: 'resume-closed-target',
      errorCode: 'PAGE_CLOSED',
    },
  );
});

test('跨页回问应处理数据库读取和写入异常', async (t) => {
  t.mock.method(console, 'error', () => {});
  const readFailure = new TeacherService(
    {
      beginTeacherTurn() {
        return null;
      },
      completeTeacherTurn() {
        return null;
      },
      findById() {
        throw new Error('读取失败');
      },
      appendTeacherPrompt() {
        return null;
      },
    },
    async function* () {
      yield '不应执行';
    },
  );
  assert.deepEqual(
    readFailure.startResume(
      {
        targetPageId: 1,
        contextPageId: 2,
        requestId: 'resume-read-failed',
      },
      () => {},
    ).result,
    {
      ok: false,
      requestId: 'resume-read-failed',
      errorCode: 'TEACHER_NO_RESPONSE',
    },
  );

  const targetPage = {
    id: 1,
    title: '目标页',
    body: '目标内容',
    source: '',
    status: 'reading',
    parseStatus: 'pending',
    teachingRoundCount: 0,
    messages: [],
  };
  const contextPage = {
    ...targetPage,
    id: 2,
    title: '上下文页',
    status: 'closed',
  };
  const writeFailure = new TeacherService(
    {
      beginTeacherTurn() {
        return null;
      },
      completeTeacherTurn() {
        return null;
      },
      findById(pageId) {
        return pageId === 1 ? targetPage : contextPage;
      },
      appendTeacherPrompt() {
        return { ok: false, reason: 'closed' };
      },
    },
    async function* () {
      yield '跨页问题';
    },
  );
  const outcome = writeFailure.startResume(
    {
      targetPageId: 1,
      contextPageId: 2,
      requestId: 'resume-write-failed',
    },
    () => {},
  );
  const done = await outcome.completion;
  assert.equal(done.ok, false);
  assert.equal(done.errorCode, 'TEACHER_NO_RESPONSE');
});

test('跨页回问应把目标页用户内容和上下文页正文传给生成器', async (t) => {
  let receivedInput;
  const { page, repository, service } = await createTeacherFixture(
    t,
    async function* (input) {
      receivedInput = input;
      yield '关联两页的问题';
    },
  );
  repository.beginTeacherTurn(page.id, '目标页的中文补充。', 'target-user');
  const contextPage = repository.create('另一个页边。', '');
  repository.beginTeacherTurn(
    contextPage.id,
    'Latest English context thought.',
    'context-user',
  );
  repository.closePage(contextPage.id, 'close-context');

  const outcome = service.startResume(
    {
      targetPageId: page.id,
      contextPageId: contextPage.id,
      requestId: 'resume-user-context',
    },
    () => {},
  );
  await outcome.completion;

  assert.equal(receivedInput.contextPage.id, contextPage.id);
  assert.equal(receivedInput.userText, '目标页的中文补充。');
  assert.equal(receivedInput.replyLanguage, 'zh-CN');
  assert.deepEqual(receivedInput.compressedPages, [
    {
      pageId: contextPage.id,
      body: '另一个页边。',
      depth: 0,
      rootPageId: contextPage.id,
    },
  ]);
  const composedMessages = composeTeacherMessages(receivedInput);
  assert.ok(
    composedMessages.some(
      (message) =>
        message.content.includes('role="closed_context"') &&
        message.content.includes('另一个页边。'),
    ),
  );
  assert.equal(
    JSON.stringify(composedMessages).includes(
      'Latest English context thought.',
    ),
    false,
  );
  assert.ok(
    receivedInput.page.messages.some(
      (message) => message.text === '目标页的中文补充。',
    ),
  );
});

test('补一句后的老师回应应流式生成并持久化', async (t) => {
  const { page, repository, service } = await createTeacherFixture(
    t,
    undefined,
  );
  repository.appendText(
    page.id,
    'This adds an English thought.',
    'append-source',
  );
  const events = [];
  const outcome = service.startMaintenance(
    {
      pageId: page.id,
      kind: 'append',
      triggerText: 'This adds an English thought.',
      requestId: 'maintenance-append',
    },
    (event) => events.push(event),
  );
  const done = await outcome.completion;

  assert.equal(done.ok, true);
  assert.match(done.reply, /You've added that thought/);
  const saved = repository.findById(page.id);
  assert.equal(saved.teachingRoundCount, 0);
  assert.equal(saved.messages.at(-1).text, done.reply);
  assert.equal(saved.messages.at(-1).requestId, 'maintenance-append');
  assert.ok(events.some((event) => 'chunk' in event));
});

test('改批注后的老师回应应跟随混合内容并防重复', async (t) => {
  const { page, repository, service } = await createTeacherFixture(
    t,
    undefined,
  );
  repository.editText(page.id, '这是 mixed English note。', 'edit-source');
  const payload = {
    pageId: page.id,
    kind: 'edit',
    triggerText: '这是 mixed English note。',
    requestId: 'maintenance-edit',
  };
  const first = service.startMaintenance(payload, () => {});
  const done = await first.completion;

  assert.match(done.reply, /修改后更清楚了/);
  assert.doesNotMatch(done.reply, /Clearer now/);
  const second = service.startMaintenance(payload, () => {});
  assert.equal(second.completion, undefined);
  assert.equal(
    repository
      .findById(page.id)
      .messages.filter((message) => message.requestId === 'maintenance-edit')
      .length,
    1,
  );
});

test('维护老师回应应拒绝关闭页面和无效请求', async (t) => {
  const { page, repository, service } = await createTeacherFixture(
    t,
    undefined,
  );

  assert.equal(
    service.startMaintenance(
      { pageId: page.id, kind: 'unknown', triggerText: '内容', requestId: 'x' },
      () => {},
    ).result.ok,
    false,
  );

  repository.closePage(page.id, 'close-for-maintenance');
  assert.deepEqual(
    service.startMaintenance(
      {
        pageId: page.id,
        kind: 'edit',
        triggerText: '修改内容',
        requestId: 'maintenance-closed',
      },
      () => {},
    ).result,
    {
      ok: false,
      requestId: 'maintenance-closed',
      errorCode: 'PAGE_CLOSED',
    },
  );
});

test('维护老师回应应处理缺失页、读取异常和写入异常', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { service } = await createTeacherFixture(t, undefined);

  assert.deepEqual(
    service.startMaintenance(
      {
        pageId: 999_999,
        kind: 'append',
        triggerText: '内容',
        requestId: 'maintenance-missing',
      },
      () => {},
    ).result,
    {
      ok: false,
      requestId: 'maintenance-missing',
      errorCode: 'TEACHER_PAGE_NOT_FOUND',
    },
  );

  const readFailure = new TeacherService(
    {
      beginTeacherTurn() {
        return null;
      },
      completeTeacherTurn() {
        return null;
      },
      findById() {
        throw new Error('读取失败');
      },
      appendTeacherPrompt() {
        return null;
      },
    },
    async function* () {
      yield '不应执行';
    },
  );
  assert.deepEqual(
    readFailure.startMaintenance(
      {
        pageId: 1,
        kind: 'edit',
        triggerText: '修改内容',
        requestId: 'maintenance-read-failed',
      },
      () => {},
    ).result,
    {
      ok: false,
      requestId: 'maintenance-read-failed',
      errorCode: 'TEACHER_NO_RESPONSE',
    },
  );

  const targetPage = {
    id: 1,
    title: '目标页',
    body: '目标内容',
    source: '',
    status: 'reading',
    parseStatus: 'pending',
    teachingRoundCount: 0,
    messages: [],
  };
  const writeFailure = new TeacherService(
    {
      beginTeacherTurn() {
        return null;
      },
      completeTeacherTurn() {
        return null;
      },
      findById() {
        return targetPage;
      },
      appendTeacherPrompt() {
        return { ok: false, reason: 'closed' };
      },
    },
    async function* () {
      yield '维护回应';
    },
  );
  const done = await writeFailure.startMaintenance(
    {
      pageId: 1,
      kind: 'append',
      triggerText: '补充内容',
      requestId: 'maintenance-write-failed',
    },
    () => {},
  ).completion;
  assert.equal(done.ok, false);
  assert.equal(done.errorCode, 'TEACHER_NO_RESPONSE');
});
