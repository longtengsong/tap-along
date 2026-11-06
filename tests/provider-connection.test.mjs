import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProviderConnectionService,
  ProviderConnectionTester,
  buildChatCompletionsUrl,
} from '../src/main/services/provider-connection.ts';
import { PROMPT_CATALOG } from '../src/main/prompts/index.ts';
import { createModelGateway } from '../src/main/services/model-gateway.ts';

const runtimeConfig = {
  id: 'custom',
  baseUrl: 'https://models.example.com/v1',
  model: 'example-model',
  apiKey: 'sk-private-test-key',
};

test('连接测试应规范化 chat completions 地址', () => {
  assert.equal(
    buildChatCompletionsUrl('https://models.example.com/v1/'),
    'https://models.example.com/v1/chat/completions',
  );
  assert.equal(
    buildChatCompletionsUrl('https://models.example.com/v1/chat/completions/'),
    'https://models.example.com/v1/chat/completions',
  );
});

const createTester = (fetchImpl, timeoutMs) =>
  new ProviderConnectionTester(
    createModelGateway({
      configService: {
        resolveActive: async () => ({
          ok: false,
          errorCode: 'PROVIDER_NOT_CONFIGURED',
        }),
      },
      fetchImpl,
      timeoutMs,
    }),
    timeoutMs,
  );

test('连接测试应发送 Bearer Key 和最小请求，不携带笔记内容', async () => {
  let requestUrl = '';
  let requestOptions;
  const tester = createTester(async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return { ok: true, status: 200 };
  });

  assert.deepEqual(await tester.test(runtimeConfig), { ok: true });
  assert.equal(requestUrl, 'https://models.example.com/v1/chat/completions');
  assert.equal(requestOptions.method, 'POST');
  assert.equal(
    requestOptions.headers.Authorization,
    'Bearer sk-private-test-key',
  );
  assert.equal(requestOptions.headers['Content-Type'], 'application/json');
  assert.equal(requestOptions.signal instanceof AbortSignal, true);

  assert.deepEqual(JSON.parse(requestOptions.body), {
    model: 'example-model',
    messages: [{ role: 'user', content: 'Reply with OK.' }],
    max_tokens: 1,
    stream: false,
  });
  assert.equal(requestOptions.body.includes('笔记'), false);
  assert.equal(requestOptions.body.includes('page'), false);
});

test('连接测试应使用开发者配置的测试提示词', async () => {
  let requestOptions;
  const promptCatalog = structuredClone(PROMPT_CATALOG);
  promptCatalog.provider.connectionTest = 'Custom connection check.';
  const tester = createTester(async (_url, options) => {
    requestOptions = options;
    return { ok: true, status: 200 };
  });

  assert.deepEqual(await tester.test(runtimeConfig, promptCatalog), {
    ok: true,
  });
  assert.equal(
    JSON.parse(requestOptions.body).messages[0].content,
    'Custom connection check.',
  );
});

test('连接测试应把常见 HTTP 错误映射为可展示错误', async (t) => {
  const cases = [
    [401, 'PROVIDER_UNAUTHORIZED'],
    [403, 'PROVIDER_UNAUTHORIZED'],
    [400, 'MODEL_UNAVAILABLE'],
    [404, 'MODEL_UNAVAILABLE'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [500, 'PROVIDER_TEST_FAILED'],
  ];

  for (const [status, errorCode] of cases) {
    await t.test(`HTTP ${status}`, async () => {
      const tester = createTester(async () => ({
        ok: false,
        status,
      }));

      assert.deepEqual(await tester.test(runtimeConfig), {
        ok: false,
        errorCode,
      });
    });
  }
});

test('连接测试应区分网络异常和超时，并避免泄露密钥', async () => {
  const networkTester = createTester(async () => {
    throw 'network unavailable';
  });
  const networkResult = await networkTester.test(runtimeConfig);

  assert.deepEqual(networkResult, {
    ok: false,
    errorCode: 'PROVIDER_NETWORK_ERROR',
  });
  assert.equal(JSON.stringify(networkResult).includes('sk-private'), false);

  const timeoutTester = createTester(
    async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      }),
    5,
  );

  assert.deepEqual(await timeoutTester.test(runtimeConfig), {
    ok: false,
    errorCode: 'PROVIDER_TIMEOUT',
  });
});

test('连接服务应在配置解析成功后调用测试器', async () => {
  let testedConfig;
  const service = new ProviderConnectionService(
    {
      resolve: async (id) =>
        id === 'custom'
          ? { ok: true, config: runtimeConfig }
          : { ok: false, errorCode: 'PROVIDER_NOT_CONFIGURED' },
    },
    {
      test: async (config) => {
        testedConfig = config;
        return { ok: true };
      },
    },
  );

  assert.deepEqual(await service.test('custom'), { ok: true });
  assert.equal(testedConfig, runtimeConfig);
  assert.deepEqual(await service.test('deepseek'), {
    ok: false,
    errorCode: 'PROVIDER_NOT_CONFIGURED',
  });
});

test('连接服务应把有效 Prompt 配置传给测试器', async () => {
  let testedPromptCatalog;
  const promptCatalog = structuredClone(PROMPT_CATALOG);
  promptCatalog.provider.connectionTest = 'Configured check.';
  const service = new ProviderConnectionService(
    {
      resolve: async () => ({ ok: true, config: runtimeConfig }),
    },
    {
      test: async (_config, prompts) => {
        testedPromptCatalog = prompts;
        return { ok: true };
      },
    },
    {
      resolve: () => promptCatalog,
    },
  );

  assert.deepEqual(await service.test('custom'), { ok: true });
  assert.equal(testedPromptCatalog, promptCatalog);
});
