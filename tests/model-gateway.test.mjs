import assert from 'node:assert/strict';
import test from 'node:test';
import { createModelGateway } from '../src/main/services/model-gateway.ts';

const config = {
  id: 'custom',
  baseUrl: 'https://models.example.com/v1',
  model: 'gateway-model',
  apiKey: 'sk-gateway-secret',
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

const createGateway = ({
  fetchImpl,
  inspector,
  resolveActive,
  timeoutMs,
} = {}) => {
  const calls = [];
  const gateway = createModelGateway({
    configService: {
      resolveActive: resolveActive ?? (async () => ({ ok: true, config })),
    },
    inspector,
    timeoutMs,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return fetchImpl(url, init);
    },
  });

  return { gateway, calls };
};

test('非流式补全应走统一网关并登记请求', async () => {
  const records = [];
  const { gateway, calls } = createGateway({
    inspector: {
      recordSent(input) {
        records.push(['sent', input]);
      },
      recordFailed(requestId, errorCode) {
        records.push(['failed', requestId, errorCode]);
      },
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '  hello  ' } }],
      }),
    }),
  });
  const messages = [{ role: 'user', content: 'hi' }];
  const content = await gateway.complete(messages, {
    requestId: 'gateway-1',
    maxTokens: 123,
  });

  assert.equal(content, 'hello');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://models.example.com/v1/chat/completions');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'gateway-model');
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 123);
  assert.deepEqual(records, [
    [
      'sent',
      {
        requestId: 'gateway-1',
        providerId: 'custom',
        model: 'gateway-model',
        messages,
      },
    ],
  ]);
});

test('流式补全应走统一网关并回传 SSE 分片', async () => {
  const records = [];
  const { gateway, calls } = createGateway({
    inspector: {
      recordSent(input) {
        records.push(['sent', input.requestId]);
      },
      recordFailed(requestId, errorCode) {
        records.push(['failed', requestId, errorCode]);
      },
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: createStreamBody([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好？"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    }),
  });
  const chunks = [];
  for await (const chunk of gateway.stream([{ role: 'user', content: 'hi' }], {
    requestId: 'gateway-stream',
  })) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ['你', '好？']);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].init.body).stream, true);
  assert.deepEqual(records, [['sent', 'gateway-stream']]);
});

test('网关失败时应登记 failed 并保留错误码', async () => {
  const records = [];
  const { gateway } = createGateway({
    inspector: {
      recordSent(input) {
        records.push(['sent', input.requestId]);
      },
      recordFailed(requestId, errorCode) {
        records.push(['failed', requestId, errorCode]);
      },
    },
    fetchImpl: async () => {
      throw new TypeError('network');
    },
  });

  await assert.rejects(
    () =>
      gateway.complete([{ role: 'user', content: 'hi' }], {
        requestId: 'gateway-failed',
      }),
    (error) => error.errorCode === 'PROVIDER_NETWORK_ERROR',
  );
  assert.deepEqual(records, [
    ['sent', 'gateway-failed'],
    ['failed', 'gateway-failed', 'PROVIDER_NETWORK_ERROR'],
  ]);
});
