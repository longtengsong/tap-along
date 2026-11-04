import assert from 'node:assert/strict';
import test from 'node:test';
import { createStructuredCompletion } from '../src/main/services/structured-completion.ts';
import { ProviderRequestError } from '../src/main/services/model-teacher.ts';

const config = {
  id: 'custom',
  baseUrl: 'https://models.example.com/v1',
  model: 'router-model',
  apiKey: 'sk-secret',
};

const response = (content, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => ({
    choices: content === undefined ? [] : [{ message: { content } }],
  }),
});

const create = (fetchImpl, resolveActive) =>
  createStructuredCompletion({
    configService: {
      resolveActive: resolveActive ?? (async () => ({ ok: true, config })),
    },
    fetchImpl,
  });

test('结构化补全应发送非流式最小请求并返回文本', async () => {
  const calls = [];
  const complete = create(async (url, init) => {
    calls.push({ url, init });
    return response('  hello  ');
  });
  const content = await complete.complete([{ role: 'user', content: 'hi' }], {
    maxTokens: 123,
    timeoutMs: 100,
  });

  assert.equal(content, 'hello');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://models.example.com/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-secret');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 123);
  assert.equal(body.model, 'router-model');
});

test('未配置模型、HTTP 错误和异常响应应返回受控错误', async (t) => {
  await t.test('未配置', async () => {
    const complete = create(
      async () => response('x'),
      async () => ({ ok: false, errorCode: 'PROVIDER_NOT_CONFIGURED' }),
    );
    await assert.rejects(
      () => complete.complete([{ role: 'user', content: 'hi' }]),
      (error) =>
        error instanceof ProviderRequestError &&
        error.errorCode === 'PROVIDER_NOT_CONFIGURED',
    );
  });

  const cases = [
    [401, 'PROVIDER_UNAUTHORIZED'],
    [403, 'PROVIDER_UNAUTHORIZED'],
    [400, 'MODEL_UNAVAILABLE'],
    [404, 'MODEL_UNAVAILABLE'],
    [408, 'PROVIDER_TIMEOUT'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [500, 'PROVIDER_REQUEST_FAILED'],
  ];

  for (const [status, errorCode] of cases) {
    await t.test(String(status), async () => {
      const complete = create(async () => response('x', status));
      await assert.rejects(
        () => complete.complete([{ role: 'user', content: 'hi' }]),
        (error) => error.errorCode === errorCode,
      );
    });
  }

  await t.test('缺少 choices', async () => {
    const complete = create(async () => response(undefined));
    await assert.rejects(
      () => complete.complete([{ role: 'user', content: 'hi' }]),
      (error) => error.errorCode === 'PROVIDER_REQUEST_FAILED',
    );
  });

  await t.test('无效 JSON', async () => {
    const complete = create(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
    }));
    await assert.rejects(
      () => complete.complete([{ role: 'user', content: 'hi' }]),
      (error) => error.errorCode === 'PROVIDER_REQUEST_FAILED',
    );
  });
});

test('网络异常、超时和调用方取消应区分处理', async (t) => {
  await t.test('网络异常', async () => {
    const complete = create(async () => {
      throw new TypeError('network');
    });
    await assert.rejects(
      () => complete.complete([{ role: 'user', content: 'hi' }]),
      (error) => error.errorCode === 'PROVIDER_NETWORK_ERROR',
    );
  });

  await t.test('超时', async () => {
    const complete = create(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    await assert.rejects(
      () =>
        complete.complete([{ role: 'user', content: 'hi' }], { timeoutMs: 5 }),
      (error) => error.errorCode === 'PROVIDER_TIMEOUT',
    );
  });

  await t.test('调用方取消', async () => {
    const controller = new AbortController();
    controller.abort();
    const complete = create(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });
    await assert.rejects(
      () =>
        complete.complete([{ role: 'user', content: 'hi' }], {
          signal: controller.signal,
        }),
      (error) => error.name === 'AbortError',
    );
  });
});
