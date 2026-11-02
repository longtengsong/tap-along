import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTeacherMessages,
  createModelAwareTeacherStream,
} from '../src/main/services/model-teacher.ts';
import { TEACHER_SYSTEM_PROMPT } from '../src/main/services/teacher-prompt.ts';

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
  fetchImpl,
  timeoutMs,
}) =>
  createModelAwareTeacherStream({
    configService: {
      resolveActive:
        resolveActive ?? (async () => ({ ok: true, config: providerConfig })),
    },
    fallback: async function* (input) {
      fallbackCalls.push(input);
      yield '本地老师回应';
    },
    fetchImpl,
    timeoutMs,
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
    content: TEACHER_SYSTEM_PROMPT,
  });
  assert.match(messages[1].content, /注意力与带宽/);
  assert.match(messages[1].content, /注意力是一种有限资源/);
  assert.deepEqual(messages.slice(2), [
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
  assert.equal(withoutEmptyMessages.length, 3);
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
  assert.equal(requestBody.messages[0].content, TEACHER_SYSTEM_PROMPT);
  assert.match(requestBody.messages[1].content, /注意力与带宽/);
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

test('未配置激活供应商时普通问答应回退本地老师', async () => {
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
  assert.equal(configCalls, 1);
  assert.equal(fallbackCalls.length, 1);
});

test('跨页回问和维护流程应继续使用本地老师且不读取模型配置', async () => {
  const fallbackCalls = [];
  const generator = createGenerator({
    resolveActive: async () => {
      throw new Error('不应读取模型配置');
    },
    fallbackCalls,
  });
  const baseInput = {
    page: createPage(),
    userText: '继续。',
    replyLanguage: 'zh-CN',
  };

  assert.deepEqual(
    await collect(
      generator({
        ...baseInput,
        contextPage: createPage(),
      }),
    ),
    ['本地老师回应'],
  );
  assert.deepEqual(
    await collect(
      generator({
        ...baseInput,
        maintenanceKind: 'edit',
      }),
    ),
    ['本地老师回应'],
  );
  assert.equal(fallbackCalls.length, 2);
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
    /模型供应商配置不可用/,
  );
});

test('模型服务错误和异常响应应拒绝生成', async (t) => {
  await t.test('HTTP 鉴权失败', async () => {
    const generator = createGenerator({
      fetchImpl: async () => createSseResponse([], 401),
    });

    await assert.rejects(
      collect(
        generator({
          page: createPage(),
          userText: '继续。',
          replyLanguage: 'zh-CN',
        }),
      ),
      /模型服务请求失败/,
    );
  });

  await t.test('缺少响应体', async () => {
    const generator = createGenerator({
      fetchImpl: async () => ({ ok: true, status: 200, body: null }),
    });

    await assert.rejects(
      collect(
        generator({
          page: createPage(),
          userText: '继续。',
          replyLanguage: 'zh-CN',
        }),
      ),
      /未返回流式响应/,
    );
  });

  await t.test('网络异常', async () => {
    const generator = createGenerator({
      fetchImpl: async () => {
        throw new TypeError('network failed');
      },
    });

    await assert.rejects(
      collect(
        generator({
          page: createPage(),
          userText: '继续。',
          replyLanguage: 'zh-CN',
        }),
      ),
      /network failed/,
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

      await assert.rejects(
        collect(
          generator({
            page: createPage(),
            userText: '继续。',
            replyLanguage: 'zh-CN',
          }),
        ),
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

  await assert.rejects(
    collect(
      generator({
        page: createPage(),
        userText: '继续。',
        replyLanguage: 'zh-CN',
      }),
    ),
    /stream aborted/,
  );
});
