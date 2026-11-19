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

const createFailingStreamBody = (parts) => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.error(new TypeError('stream broken'));
    },
  });
};

const createInspector = (records) => ({
  recordSent(input) {
    records.push(['sent', input]);
  },
  recordCompleted(requestId, input) {
    records.push(['completed', requestId, input]);
  },
  recordFailed(requestId, errorCode, latencyMs) {
    records.push(['failed', requestId, errorCode, latencyMs]);
  },
});

const createGateway = ({
  fetchImpl,
  inspector,
  resolveActive,
  timeoutMs,
  images,
  capabilities,
} = {}) => {
  const calls = [];
  const gateway = createModelGateway({
    configService: {
      resolveActive: resolveActive ?? (async () => ({ ok: true, config })),
    },
    inspector,
    images,
    capabilities,
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
    inspector: createInspector(records),
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
    promptVersion: 'companion-v2.0.0',
    promptHash: 'abc123',
  });

  assert.equal(content, 'hello');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://models.example.com/v1/chat/completions');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'gateway-model');
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 123);
  assert.deepEqual(records[0], [
    'sent',
    {
      requestId: 'gateway-1',
      providerId: 'custom',
      model: 'gateway-model',
      messages,
      promptVersion: 'companion-v2.0.0',
      promptHash: 'abc123',
      temperature: 0,
    },
  ]);
  assert.equal(records[1][0], 'completed');
  assert.equal(records[1][1], 'gateway-1');
  assert.equal(records[1][2].reply, 'hello');
  assert.equal(typeof records[1][2].latencyMs, 'number');
});

test('流式补全应走统一网关并回传 SSE 分片', async () => {
  const records = [];
  const { gateway, calls } = createGateway({
    inspector: createInspector(records),
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
    promptVersion: 'companion-v2.0.0',
    promptHash: 'abc123',
  })) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ['你', '好？']);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].init.body).stream, true);
  assert.equal(records[0][0], 'sent');
  assert.equal(records[0][1].requestId, 'gateway-stream');
  assert.equal(records[0][1].promptVersion, 'companion-v2.0.0');
  assert.equal(records[0][1].promptHash, 'abc123');
  assert.equal(records[1][0], 'completed');
  assert.equal(records[1][2].reply, '你好？');
  assert.equal(typeof records[1][2].latencyMs, 'number');
});

test('网关失败时应登记 failed 并保留错误码', async () => {
  const records = [];
  const { gateway } = createGateway({
    inspector: createInspector(records),
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
  assert.equal(records[0][0], 'sent');
  assert.equal(records[1][0], 'failed');
  assert.equal(records[1][1], 'gateway-failed');
  assert.equal(records[1][2], 'PROVIDER_NETWORK_ERROR');
  assert.equal(typeof records[1][3], 'number');
  assert.equal(
    records.some((record) => record[0] === 'completed'),
    false,
  );
});

test('流式中断时不应回写回复', async () => {
  const records = [];
  const { gateway } = createGateway({
    inspector: createInspector(records),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: createFailingStreamBody([
        'data: {"choices":[{"delta":{"content":"半句"}}]}\n\n',
      ]),
    }),
  });

  await assert.rejects(
    async () => {
      for await (const chunk of gateway.stream(
        [{ role: 'user', content: 'hi' }],
        { requestId: 'gateway-broken' },
      )) {
        assert.equal(chunk, '半句');
      }
    },
    (error) => error.errorCode === 'PROVIDER_NETWORK_ERROR',
  );
  assert.equal(records[0][0], 'sent');
  assert.equal(records[1][0], 'failed');
  assert.equal(
    records.some((record) => record[0] === 'completed'),
    false,
  );
});

test('调用方提前结束流时不应回写回复', async () => {
  const records = [];
  const { gateway } = createGateway({
    inspector: createInspector(records),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: createStreamBody([
        'data: {"choices":[{"delta":{"content":"第一块"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"第二块"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    }),
  });

  for await (const chunk of gateway.stream([{ role: 'user', content: 'hi' }], {
    requestId: 'gateway-early-exit',
  })) {
    assert.equal(chunk, '第一块');
    break;
  }

  assert.deepEqual(
    records.map((record) => record[0]),
    ['sent'],
  );
});

test('能力支持时应把图片转成 image_url parts 并去重', async () => {
  const records = [];
  const resolved = [];
  const { gateway, calls } = createGateway({
    inspector: createInspector(records),
    capabilities: { supportsActive: async () => true },
    images: {
      async resolve(imageId) {
        resolved.push(imageId);
        return {
          mime: 'image/webp',
          dataUrl: `data:image/webp;base64,${imageId}`,
        };
      },
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
      }),
    }),
  });

  await gateway.complete(
    [
      { role: 'user', content: '当前页', imageIds: ['image-1'] },
      {
        role: 'user',
        content: '图片上下文',
        imageIds: ['image-1', 'image-2'],
        imageContext: true,
      },
    ],
    { requestId: 'gateway-images' },
  );

  const body = JSON.parse(calls[0].init.body);
  const current = body.messages[0].content;
  const context = body.messages[1].content;

  assert.deepEqual(current, [
    { type: 'text', text: '当前页' },
    {
      type: 'image_url',
      image_url: { url: 'data:image/webp;base64,image-1' },
    },
  ]);
  assert.deepEqual(context, [
    { type: 'text', text: '图片上下文' },
    {
      type: 'image_url',
      image_url: { url: 'data:image/webp;base64,image-2' },
    },
  ]);
  assert.deepEqual(resolved, ['image-1', 'image-2']);
  assert.equal(JSON.stringify(records).includes('data:image/webp'), false);
  assert.equal(records[0][1].messages[0].content, '当前页\n[1 image(s)]');
  assert.equal(records[0][1].messages[0].imageIds, undefined);
});

test('能力不支持时应降级纯文本并丢弃 imageContext', async () => {
  const records = [];
  const { gateway, calls } = createGateway({
    inspector: createInspector(records),
    capabilities: { supportsActive: async () => false },
    images: { resolve: async () => null },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
      }),
    }),
  });

  await gateway.complete([
    { role: 'user', content: '当前页', imageIds: ['image-1'] },
    {
      role: 'user',
      content: '图片上下文',
      imageIds: ['image-1'],
      imageContext: true,
    },
  ]);

  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.messages, [{ role: 'user', content: '当前页' }]);
});

test('纯文字请求不应触发能力检测', async () => {
  let checks = 0;
  const { gateway } = createGateway({
    capabilities: {
      supportsActive: async () => {
        checks += 1;
        return true;
      },
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
      }),
    }),
  });

  await gateway.complete([{ role: 'user', content: '纯文字' }]);
  assert.equal(checks, 0);
});

test('图片读取失败时应保留文本占位并继续请求', async () => {
  const { gateway, calls } = createGateway({
    capabilities: { supportsActive: async () => true },
    images: { resolve: async () => null },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
      }),
    }),
  });

  await gateway.complete([
    { role: 'user', content: '当前页', imageIds: ['missing'] },
  ]);

  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.messages[0].content, [
    { type: 'text', text: '当前页' },
    { type: 'text', text: '[image unavailable]' },
  ]);
});
