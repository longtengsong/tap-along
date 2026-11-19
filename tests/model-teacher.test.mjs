import assert from 'node:assert/strict';
import test from 'node:test';
import { createModelAwareTeacherStream } from '../src/main/services/model-teacher.ts';
import {
  buildMaintenanceTeacherMessages,
  buildResumeTeacherMessages,
  buildTeacherMessages,
  composeTeacherMessages,
  PROMPT_CATALOG,
  PROMPT_VERSION,
} from '../src/main/prompts/index.ts';

const providerConfig = {
  id: 'custom',
  baseUrl: 'https://models.example.com/v1',
  model: 'reading-model',
  apiKey: 'sk-stream-private-key',
};

const createPage = (messages = []) => ({
  id: 1,
  title: '注意力与带宽',
  body: '注意力是一种有限资源。',
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 1,
  messages,
});

const collect = async (generator) => {
  const chunks = [];

  for await (const chunk of generator) {
    chunks.push(chunk);
  }

  return chunks;
};

const assertProviderError = (promise, errorCode) =>
  assert.rejects(promise, (error) => {
    assert.equal(error.name, 'ProviderRequestError');
    assert.equal(error.errorCode, errorCode);
    assert.equal(error.message.includes(providerConfig.apiKey), false);
    return true;
  });

const createStreamBody = (parts) => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
};

const createSseResponse = (parts, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  body: createStreamBody(parts),
});

const createGenerator = ({
  fallbackCalls = [],
  resolveActive,
  promptService,
  inspector,
  fetchImpl,
  timeoutMs,
}) =>
  createModelAwareTeacherStream({
    configService: {
      resolveActive:
        resolveActive ?? (async () => ({ ok: true, config: providerConfig })),
    },
    promptService,
    inspector,
    fallback: async function* (input) {
      fallbackCalls.push(input);
      yield '本地老师回应';
    },
    fetchImpl,
    timeoutMs,
  });

test('开发者 Prompt 应应用于普通问答、跨页恢复和维护请求', async () => {
  const requestBodies = [];
  const promptCatalog = structuredClone(PROMPT_CATALOG);
  promptCatalog.teacher.system = '自定义基础老师';
  promptCatalog.teacher.languagePolicy = '自定义语言策略';
  promptCatalog.teacher.resume = '自定义跨页恢复';
  promptCatalog.teacher.maintenance = '自定义维护任务';
  promptCatalog.teacher.contextBoundary = '自定义上下文边界';
  promptCatalog.teacher.compressedContextPolicy = '自定义压缩上下文';
  promptCatalog.teacher.context.currentPage =
    '<custom_current>{{title}}|{{body}}</custom_current>';
  promptCatalog.teacher.context.closedPage =
    '<custom_closed>{{depth}}|{{body}}</custom_closed>';
  promptCatalog.teacher.context.targetPage =
    '<custom_target>{{title}}|{{body}}</custom_target>';
  promptCatalog.teacher.maintenanceAction.edit = '自定义编辑动作';
  promptCatalog.teacher.maintenanceAction.append = '自定义补写动作';

  const generator = createGenerator({
    promptService: {
      resolve: () => promptCatalog,
    },
    fetchImpl: async (_url, options) => {
      requestBodies.push(JSON.parse(options.body));
      return createSseResponse([
        'data: {"choices":[{"delta":{"content":"自定义回应？"}}]}\n\n',
        'data: [DONE]\n\n',
      ]);
    },
  });
  const page = createPage();

  await collect(
    generator({
      page,
      userText: '普通问题。',
      replyLanguage: 'zh-CN',
    }),
  );
  await collect(
    generator({
      page,
      contextPage: { ...page, id: 2, body: '上下文正文' },
      userText: '跨页问题。',
      replyLanguage: 'zh-CN',
    }),
  );
  await collect(
    generator({
      page,
      userText: '编辑后的正文。',
      replyLanguage: 'zh-CN',
      maintenanceKind: 'edit',
    }),
  );

  assert.equal(requestBodies.length, 3);
  assert.equal(requestBodies[0].messages[0].content, '自定义基础老师');
  assert.equal(requestBodies[0].messages[1].content, '自定义语言策略');
  assert.equal(requestBodies[0].messages[2].content, '自定义上下文边界');
  assert.match(
    requestBodies[0].messages[3].content,
    /<custom_current>注意力与带宽/,
  );
  assert.equal(requestBodies[1].messages[2].content, '自定义跨页恢复');
  assert.equal(requestBodies[1].messages[4].content, '自定义压缩上下文');
  assert.match(
    requestBodies[1].messages[5].content,
    /<custom_target>注意力与带宽/,
  );
  assert.match(requestBodies[1].messages[6].content, /<custom_closed>/);
  assert.equal(requestBodies[2].messages[2].content, '自定义维护任务');
  assert.equal(requestBodies[2].messages[3].content, '自定义编辑动作');
});

test('模型请求应把最终 Messages 和模型信息交给开发者检查器', async () => {
  const calls = [];
  const generator = createGenerator({
    inspector: {
      recordSent(input) {
        calls.push(['sent', input]);
      },
      recordCompleted(requestId, input) {
        calls.push(['completed', requestId, input]);
      },
      recordFailed(requestId, errorCode) {
        calls.push(['failed', requestId, errorCode]);
      },
      recordFallback(requestId) {
        calls.push(['fallback', requestId]);
      },
    },
    fetchImpl: async () =>
      createSseResponse([
        'data: {"choices":[{"delta":{"content":"请求问题？"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
  });

  await collect(
    generator({
      requestId: 'inspect-request-1',
      page: createPage(),
      userText: '检查这次请求。',
      replyLanguage: 'zh-CN',
    }),
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'sent');
  assert.equal(calls[0][1].requestId, 'inspect-request-1');
  assert.equal(calls[0][1].providerId, 'custom');
  assert.equal(calls[0][1].model, 'reading-model');
  assert.equal(calls[0][1].promptVersion, PROMPT_VERSION);
  assert.equal(typeof calls[0][1].promptHash, 'string');
  assert.equal(calls[0][1].promptHash.length, 16);
  assert.equal(calls[0][1].messages[0].content, PROMPT_CATALOG.teacher.system);
  assert.equal(calls[1][0], 'completed');
  assert.equal(calls[1][1], 'inspect-request-1');
  assert.equal(calls[1][2].reply, '请求问题？');
});

test('模型请求失败和本地回退应更新开发者检查器状态', async () => {
  const calls = [];
  const inspector = {
    recordSent(input) {
      calls.push(['sent', input.requestId]);
    },
    recordFailed(requestId, errorCode) {
      calls.push(['failed', requestId, errorCode]);
    },
    recordFallback(requestId) {
      calls.push(['fallback', requestId]);
    },
  };
  const failedGenerator = createGenerator({
    inspector,
    fetchImpl: async () => {
      throw new TypeError('network failed');
    },
  });

  await assertProviderError(
    collect(
      failedGenerator({
        requestId: 'failed-request',
        page: createPage(),
        userText: '请求失败。',
        replyLanguage: 'zh-CN',
      }),
    ),
    'PROVIDER_NETWORK_ERROR',
  );
  assert.deepEqual(calls, [
    ['sent', 'failed-request'],
    ['failed', 'failed-request', 'PROVIDER_NETWORK_ERROR'],
  ]);

  const fallbackCalls = [];
  const fallbackGenerator = createGenerator({
    inspector,
    resolveActive: async () => ({
      ok: false,
      errorCode: 'PROVIDER_NOT_CONFIGURED',
    }),
    fallbackCalls,
  });
  await collect(
    fallbackGenerator({
      requestId: 'fallback-request',
      page: createPage(),
      userText: '本地回退。',
      replyLanguage: 'zh-CN',
    }),
  );
  assert.deepEqual(calls.at(-1), ['fallback', 'fallback-request']);
});

test('模型消息应包含页面上下文、历史角色和最新一次用户问题', () => {
  const page = createPage([
    { role: 'user', text: '这是我的旧想法。' },
    { role: 'teacher', text: '旧问题是什么？' },
    { role: 'maintenance', text: '我补了一句。' },
    { role: 'user', text: '这是我真正的问题。' },
  ]);
  const messages = buildTeacherMessages({
    page,
    userText: '这是我真正的问题。',
    replyLanguage: 'zh-CN',
  });

  assert.deepEqual(messages[0], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.system,
  });
  assert.deepEqual(messages[1], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.languagePolicy,
  });
  assert.deepEqual(messages[2], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.contextBoundary,
  });
  assert.match(messages[3].content, /<study_page role="current">/);
  assert.match(messages[3].content, /注意力与带宽/);
  assert.match(messages[3].content, /注意力是一种有限资源/);
  assert.deepEqual(messages.slice(4), [
    { role: 'user', content: '这是我的旧想法。' },
    { role: 'assistant', content: '旧问题是什么？' },
    { role: 'user', content: '我补了一句。' },
    { role: 'user', content: '这是我真正的问题。' },
  ]);

  const appended = buildTeacherMessages({
    page: createPage([
      { role: 'user', text: '旧消息' },
      { role: 'teacher', text: '旧回应' },
    ]),
    userText: '尚未写入页面的新问题',
    replyLanguage: 'zh-CN',
  });
  assert.deepEqual(appended.at(-1), {
    role: 'user',
    content: '尚未写入页面的新问题',
  });

  const withoutEmptyMessages = buildTeacherMessages({
    page: createPage([{ role: 'teacher', text: '   ' }]),
    userText: '当前问题',
    replyLanguage: 'zh-CN',
  });
  assert.equal(withoutEmptyMessages.length, 5);
});

test('引导里的旧念头应作为会话背景带进后续对谈', () => {
  const page = {
    ...createPage([
      { role: 'teacher', text: '你写过主动分配，也写过任务牵引？' },
    ]),
    guidance: {
      status: 'needed',
      bodyHash: 'hash',
      updatedAt: 1,
      suggestions: [
        {
          id: 'g-2-3',
          relatedPageIds: [2, 3],
          notes: [
            {
              pageId: 2,
              title: '注意力与任务',
              source: '课程',
              excerpt: '注意力需要主动分配。',
            },
            {
              pageId: 3,
              title: '任务牵引',
              source: '日记',
              excerpt: '任务会牵引注意力。',
            },
          ],
          why: '两页分别讲了分配和牵引。',
          question: '那这页说的“有限”到底卡在哪？',
          used: true,
        },
      ],
    },
  };
  const messages = buildTeacherMessages({
    page,
    userText: '我还没想清楚。',
    replyLanguage: 'zh-CN',
  });
  const thread = messages.find(
    (message) =>
      message.role === 'system' &&
      message.content.includes('purpose="session_background"'),
  );

  assert.ok(thread);
  assert.match(thread.content, /<related_note id="2">/);
  assert.match(thread.content, /<related_note id="3">/);
  assert.match(thread.content, /注意力需要主动分配/);
  assert.match(thread.content, /任务会牵引注意力/);
  assert.match(thread.content, /not instructions/);
});

test('未点开的引导也应把旧念头作为会话背景带入', () => {
  const guidance = {
    status: 'needed',
    bodyHash: 'hash',
    updatedAt: 1,
    suggestions: [
      {
        id: 'g-2',
        relatedPageIds: [2],
        notes: [
          {
            pageId: 2,
            title: '注意力与任务',
            source: '课程',
            excerpt: '注意力需要主动分配。',
          },
        ],
        why: '两页都在讨论注意力。',
        question: '那这页说的“有限”到底卡在哪？',
      },
    ],
  };
  const unused = buildTeacherMessages({
    page: { ...createPage(), guidance },
    userText: '继续。',
    replyLanguage: 'zh-CN',
  });
  const background = unused.find(
    (message) =>
      message.role === 'system' &&
      message.content.includes('purpose="session_background"'),
  );

  assert.ok(background);
  assert.match(background.content, /<related_note id="2">/);
  assert.match(background.content, /注意力需要主动分配/);

  const withoutExcerpt = buildTeacherMessages({
    page: {
      ...createPage(),
      guidance: {
        ...guidance,
        suggestions: [
          {
            ...guidance.suggestions[0],
            notes: [
              {
                pageId: 2,
                title: '注意力与任务',
                source: '课程',
              },
            ],
            used: true,
          },
        ],
      },
    },
    userText: '继续。',
    replyLanguage: 'zh-CN',
  });
  assert.equal(
    withoutExcerpt.some((message) =>
      message.content.includes('session_background'),
    ),
    false,
  );
});

test('联网回答也应带上引导旧念头和另记页背景', () => {
  const page = {
    ...createPage(),
    guidance: {
      status: 'needed',
      bodyHash: 'hash',
      updatedAt: 1,
      suggestions: [
        {
          id: 'g-2',
          relatedPageIds: [2],
          notes: [
            {
              pageId: 2,
              title: '系统与外力反馈',
              source: '《系统之美》',
              excerpt: '系统的结构决定行为。',
            },
          ],
          why: '这条线有关',
          question: '结构如何决定行为？',
        },
      ],
    },
  };
  const messages = composeTeacherMessages({
    page,
    userText: '什么是系统基模？',
    research: [
      {
        source: {
          index: 1,
          title: 'System archetype',
          url: 'https://example.com/archetype',
          domain: 'example.com',
        },
        snippet: '系统基模是反复出现的系统结构。',
      },
    ],
    compressedPages: [
      {
        pageId: 9,
        body: '另记页里的正文。',
        depth: 1,
        rootPageId: 9,
      },
    ],
  });
  const serialized = JSON.stringify(messages);

  assert.ok(serialized.includes('session_background'));
  assert.ok(serialized.includes('related_notes'));
  assert.match(serialized, /系统的结构决定行为/);
  assert.match(serialized, /另记页里的正文/);
  assert.match(serialized, /not web sources/);
  assert.match(serialized, /web_source/);
});

test('跨页模型消息应只包含上下文正文、目标页和目标页真实对谈', () => {
  const contextPage = {
    ...createPage([
      { role: 'user', text: '上下文页里的最后想法。' },
      { role: 'teacher', text: '上下文页里的老师问题？' },
    ]),
    id: 2,
    title: '有限的注意力',
    body: '注意力需要主动分配。',
    status: 'closed',
  };
  const targetPage = {
    ...createPage([
      { role: 'teacher', text: '目标页的开场问题？' },
      {
        role: 'maintenance',
        text: '',
        actionType: 'forked',
        childPageId: 2,
      },
      { role: 'user', text: '目标页里的当前想法。' },
    ]),
    id: 3,
    title: '注意力与任务',
    body: '任务会牵引注意力。',
  };
  const messages = buildResumeTeacherMessages({
    page: targetPage,
    contextPage,
    userText: '上下文页里的最后想法。',
    replyLanguage: 'zh-CN',
  });

  assert.deepEqual(messages[0], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.system,
  });
  assert.deepEqual(messages[1], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.languagePolicy,
  });
  assert.deepEqual(messages[2], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.resume,
  });
  assert.deepEqual(messages[3], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.contextBoundary,
  });
  assert.deepEqual(messages[4], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.compressedContextPolicy,
  });
  assert.match(messages[5].content, /role="target"/);
  assert.match(messages[5].content, /注意力与任务/);
  assert.match(messages[5].content, /任务会牵引注意力/);
  assert.deepEqual(messages[6], {
    role: 'assistant',
    content: '目标页的开场问题？',
  });
  assert.match(messages[7].content, /role="closed_context" depth="0"/);
  assert.doesNotMatch(messages[7].content, /有限的注意力/);
  assert.match(messages[7].content, /注意力需要主动分配/);
  assert.equal(
    JSON.stringify(messages).includes('上下文页里的最后想法。'),
    false,
  );
  assert.equal(
    JSON.stringify(messages).includes('上下文页里的老师问题？'),
    false,
  );
  assert.deepEqual(messages.at(-1), {
    role: 'user',
    content: '目标页里的当前想法。',
  });

  const withoutUserMessages = buildResumeTeacherMessages({
    page: { ...targetPage, messages: [] },
    contextPage: { ...contextPage, messages: [] },
    userText: '仅有正文时的上下文。',
    replyLanguage: 'zh-CN',
  });
  assert.equal(
    JSON.stringify(withoutUserMessages).includes('仅有正文时的上下文。'),
    false,
  );
});

test('维护模型消息应区分编辑和补一句并保留最新用户内容', () => {
  const page = createPage([
    { role: 'user', text: '之前的想法。' },
    { role: 'teacher', text: '之前的老师问题？' },
    { role: 'maintenance', text: '', content: '新补充的想法。' },
  ]);
  const editMessages = buildMaintenanceTeacherMessages({
    page,
    userText: '修改后的完整想法。',
    replyLanguage: 'zh-CN',
    maintenanceKind: 'edit',
  });

  assert.deepEqual(editMessages[0], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.system,
  });
  assert.deepEqual(editMessages[1], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.languagePolicy,
  });
  assert.deepEqual(editMessages[2], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.maintenance,
  });
  assert.match(editMessages[3].content, /edited the current thought/);
  assert.deepEqual(editMessages[4], {
    role: 'system',
    content: PROMPT_CATALOG.teacher.contextBoundary,
  });
  assert.match(editMessages[5].content, /<study_page role="current">/);
  assert.match(editMessages[5].content, /注意力与带宽/);
  assert.deepEqual(editMessages.at(-1), {
    role: 'user',
    content: '修改后的完整想法。',
  });

  const appendMessages = buildMaintenanceTeacherMessages({
    page,
    userText: '新补充的想法。',
    replyLanguage: 'zh-CN',
    maintenanceKind: 'append',
  });
  assert.match(appendMessages[3].content, /appended a new thought/);
  assert.deepEqual(appendMessages.at(-1), {
    role: 'user',
    content: '新补充的想法。',
  });
});

test('已配置供应商应通过 SSE 流式返回模型增量内容', async () => {
  let requestUrl = '';
  let requestOptions;
  const generator = createGenerator({
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return createSseResponse([
        'data: {"choices":[{"delta":{"content":"你',
        '好"}}]}\r\n\r\n: keepalive\n\n',
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"！"}}]}\n\n',
        'data: [DONE]\n\n',
      ]);
    },
  });

  const chunks = await collect(
    generator({
      page: createPage([{ role: 'user', text: '我的问题。' }]),
      userText: '我的问题。',
      replyLanguage: 'zh-CN',
    }),
  );

  assert.deepEqual(chunks, ['你好', '！']);
  assert.equal(requestUrl, 'https://models.example.com/v1/chat/completions');
  assert.equal(requestOptions.method, 'POST');
  assert.equal(
    requestOptions.headers.Authorization,
    `Bearer ${providerConfig.apiKey}`,
  );
  assert.equal(requestOptions.headers['Content-Type'], 'application/json');
  assert.equal(requestOptions.signal instanceof AbortSignal, true);

  const requestBody = JSON.parse(requestOptions.body);
  assert.equal(requestBody.model, 'reading-model');
  assert.equal(requestBody.stream, true);
  assert.equal(requestBody.messages[0].content, PROMPT_CATALOG.teacher.system);
  assert.equal(
    requestBody.messages[1].content,
    PROMPT_CATALOG.teacher.languagePolicy,
  );
  assert.equal(
    requestBody.messages[2].content,
    PROMPT_CATALOG.teacher.contextBoundary,
  );
  assert.match(requestBody.messages[3].content, /注意力与带宽/);
  assert.deepEqual(requestBody.messages.at(-1), {
    role: 'user',
    content: '我的问题。',
  });
  assert.equal(requestOptions.body.includes(providerConfig.apiKey), false);
});

test('流式解析应处理没有末尾空行的最后一个事件', async () => {
  const generator = createGenerator({
    fetchImpl: async () =>
      createSseResponse([
        'data: {"choices":[{"delta":{"content":"最后一段"}}]}',
      ]),
  });
  const chunks = await collect(
    generator({
      page: createPage(),
      userText: '继续。',
      replyLanguage: 'zh-CN',
    }),
  );

  assert.deepEqual(chunks, ['最后一段']);
});

test('未配置激活供应商时问答、跨页回问和维护都应回退本地老师', async () => {
  let configCalls = 0;
  const fallbackCalls = [];
  const generator = createGenerator({
    resolveActive: async () => {
      configCalls += 1;
      return { ok: false, errorCode: 'PROVIDER_NOT_CONFIGURED' };
    },
    fallbackCalls,
    fetchImpl: async () => {
      throw new Error('不应请求模型服务');
    },
  });
  const chunks = await collect(
    generator({
      page: createPage(),
      userText: '继续。',
      replyLanguage: 'zh-CN',
    }),
  );

  assert.deepEqual(chunks, ['本地老师回应']);
  assert.deepEqual(
    await collect(
      generator({
        page: createPage(),
        contextPage: createPage(),
        userText: '继续。',
        replyLanguage: 'zh-CN',
      }),
    ),
    ['本地老师回应'],
  );
  assert.deepEqual(
    await collect(
      generator({
        page: createPage(),
        userText: '维护后的内容。',
        replyLanguage: 'zh-CN',
        maintenanceKind: 'append',
      }),
    ),
    ['本地老师回应'],
  );
  assert.equal(configCalls, 3);
  assert.equal(fallbackCalls.length, 3);
});

test('跨页回问应调用激活模型并只发送上下文页正文', async () => {
  let requestOptions;
  const fallbackCalls = [];
  const generator = createGenerator({
    fallbackCalls,
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return createSseResponse([
        'data: {"choices":[{"delta":{"content":"两页之间"}}]}\n\n',
        'data: [DONE]\n\n',
      ]);
    },
  });
  const contextPage = {
    ...createPage([{ role: 'user', text: '上下文页想法。' }]),
    id: 2,
    status: 'closed',
  };

  assert.deepEqual(
    await collect(
      generator({
        page: createPage([{ role: 'user', text: '目标页想法。' }]),
        contextPage,
        userText: '上下文页想法。',
        replyLanguage: 'zh-CN',
      }),
    ),
    ['两页之间'],
  );
  const requestBody = JSON.parse(requestOptions.body);
  assert.equal(requestBody.messages[2].content, PROMPT_CATALOG.teacher.resume);
  assert.match(JSON.stringify(requestBody.messages), /注意力是一种有限资源/);
  assert.doesNotMatch(JSON.stringify(requestBody.messages), /上下文页想法/);
  assert.match(JSON.stringify(requestBody.messages), /目标页想法/);
  assert.equal(requestOptions.body.includes(providerConfig.apiKey), false);
  assert.equal(fallbackCalls.length, 0);
});

test('编辑和补一句维护流程都应调用激活模型', async () => {
  const requestBodies = [];
  const fallbackCalls = [];
  const generator = createGenerator({
    fallbackCalls,
    fetchImpl: async (_url, options) => {
      requestBodies.push(JSON.parse(options.body));
      return createSseResponse([
        'data: {"choices":[{"delta":{"content":"维护问题？"}}]}\n\n',
        'data: [DONE]\n\n',
      ]);
    },
  });
  const page = createPage([{ role: 'user', text: '原有想法。' }]);

  assert.deepEqual(
    await collect(
      generator({
        page,
        userText: '修改后的想法。',
        replyLanguage: 'zh-CN',
        maintenanceKind: 'edit',
      }),
    ),
    ['维护问题？'],
  );
  assert.deepEqual(
    await collect(
      generator({
        page,
        userText: '补充的英文 English thought。',
        replyLanguage: 'zh-CN',
        maintenanceKind: 'append',
      }),
    ),
    ['维护问题？'],
  );
  assert.equal(requestBodies.length, 2);
  assert.equal(
    requestBodies[0].messages[2].content,
    PROMPT_CATALOG.teacher.maintenance,
  );
  assert.match(
    requestBodies[0].messages[3].content,
    /edited the current thought/,
  );
  assert.match(requestBodies[1].messages[3].content, /appended a new thought/);
  assert.deepEqual(requestBodies[0].messages.at(-1), {
    role: 'user',
    content: '修改后的想法。',
  });
  assert.deepEqual(requestBodies[1].messages.at(-1), {
    role: 'user',
    content: '补充的英文 English thought。',
  });
  assert.equal(
    JSON.stringify(requestBodies).includes(providerConfig.apiKey),
    false,
  );
  assert.equal(fallbackCalls.length, 0);
});

test('模型配置异常应终止生成而不是静默回退', async () => {
  const generator = createGenerator({
    resolveActive: async () => ({
      ok: false,
      errorCode: 'CONFIG_FAILED',
    }),
  });

  await assert.rejects(
    collect(
      generator({
        page: createPage(),
        userText: '继续。',
        replyLanguage: 'zh-CN',
      }),
    ),
    (error) => {
      assert.equal(error.errorCode, 'CONFIG_FAILED');
      return true;
    },
  );
});

test('模型服务错误和异常响应应拒绝生成', async (t) => {
  for (const [status, errorCode] of [
    [401, 'PROVIDER_UNAUTHORIZED'],
    [403, 'PROVIDER_UNAUTHORIZED'],
    [400, 'MODEL_UNAVAILABLE'],
    [404, 'MODEL_UNAVAILABLE'],
    [408, 'PROVIDER_TIMEOUT'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [500, 'PROVIDER_REQUEST_FAILED'],
  ]) {
    await t.test(`HTTP ${status}`, async () => {
      const generator = createGenerator({
        fetchImpl: async () => createSseResponse([], status),
      });

      await assertProviderError(
        collect(
          generator({
            page: createPage(),
            userText: '继续。',
            replyLanguage: 'zh-CN',
          }),
        ),
        errorCode,
      );
    });
  }

  await t.test('缺少响应体', async () => {
    const generator = createGenerator({
      fetchImpl: async () => ({ ok: true, status: 200, body: null }),
    });

    await assertProviderError(
      collect(
        generator({
          page: createPage(),
          userText: '继续。',
          replyLanguage: 'zh-CN',
        }),
      ),
      'PROVIDER_REQUEST_FAILED',
    );
  });

  await t.test('网络异常', async () => {
    const generator = createGenerator({
      fetchImpl: async () => {
        throw new TypeError('network failed');
      },
    });

    await assertProviderError(
      collect(
        generator({
          page: createPage(),
          userText: '继续。',
          replyLanguage: 'zh-CN',
        }),
      ),
      'PROVIDER_NETWORK_ERROR',
    );
  });

  for (const invalidData of [
    'data: not-json\n\n',
    'data: null\n\n',
    'data: {"error":{"message":"failed"}}\n\n',
  ]) {
    await t.test(`无效流数据 ${invalidData.trim()}`, async () => {
      const generator = createGenerator({
        fetchImpl: async () => createSseResponse([invalidData]),
      });

      await assertProviderError(
        collect(
          generator({
            page: createPage(),
            userText: '继续。',
            replyLanguage: 'zh-CN',
          }),
        ),
        'PROVIDER_REQUEST_FAILED',
      );
    });
  }
});

test('模型流式请求超时时应中止连接', async () => {
  const generator = createGenerator({
    timeoutMs: 5,
    fetchImpl: async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => {
            const error = new Error('stream aborted');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      }),
  });

  await assertProviderError(
    collect(
      generator({
        page: createPage(),
        userText: '继续。',
        replyLanguage: 'zh-CN',
      }),
    ),
    'PROVIDER_TIMEOUT',
  );
});

test('外层取消信号应中止模型流式连接', async () => {
  const controller = new AbortController();
  let notifyStarted;
  const started = new Promise((resolve) => {
    notifyStarted = resolve;
  });
  const generator = createGenerator({
    fetchImpl: async (_url, options) => {
      notifyStarted();
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => {
            const error = new Error('cancelled');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      });
    },
  });
  const pending = collect(
    generator({
      page: createPage(),
      userText: '继续。',
      replyLanguage: 'zh-CN',
      signal: controller.signal,
    }),
  );

  await started;
  controller.abort();
  await assertProviderError(pending, 'PROVIDER_TIMEOUT');
});
