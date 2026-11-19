import assert from 'node:assert/strict';
import test from 'node:test';
import { ImageCapabilityService } from '../src/main/services/image-capability.ts';
import { imageCapabilityKey } from '../src/shared/providers.ts';

const config = {
  id: 'custom',
  baseUrl: 'https://models.example.com/v1',
  model: 'vision-model',
  apiKey: 'sk-secret',
};

const createService = (fetchImpl, now = () => 1_000, extra = {}) =>
  new ImageCapabilityService(
    {
      resolveActive: async () => ({ ok: true, config }),
      resolve: async () => ({ ok: true, config }),
    },
    { fetchImpl, now, timeoutMs: 50, ...extra },
  );

test('2xx 应判定为支持图片', async () => {
  const calls = [];
  const service = createService(async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200 };
  });

  assert.equal(await service.supportsActive(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://models.example.com/v1/chat/completions');

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'vision-model');
  assert.equal(body.stream, false);
  assert.equal(body.max_tokens, 1);
  assert.equal(Array.isArray(body.messages[0].content), true);
  assert.equal(body.messages[0].content[1].type, 'image_url');
  assert.match(
    body.messages[0].content[1].image_url.url,
    /^data:image\/webp;base64,/,
  );
});

test('不支持的 4xx 应判定为不支持', async () => {
  for (const status of [400, 415, 422, 401, 403, 404]) {
    const service = createService(async () => ({ ok: false, status }));
    assert.equal(await service.supportsActive(), false, String(status));
  }
});

test('429、5xx、网络错误和超时应判定为未知', async () => {
  for (const status of [429, 500]) {
    const service = createService(async () => ({ ok: false, status }));
    assert.equal(await service.supportsActive(), false, String(status));
  }

  const network = createService(async () => {
    throw new TypeError('network');
  });
  assert.equal(await network.supportsActive(), false);
});

test('支持结果应缓存 7 天，未知结果短缓存', async () => {
  let now = 1_000;
  let calls = 0;
  const service = createService(
    async () => {
      calls += 1;
      return { ok: true, status: 200 };
    },
    () => now,
  );

  assert.equal(await service.supportsActive(), true);
  assert.equal(await service.supportsActive(), true);
  assert.equal(calls, 1);

  now += 7 * 24 * 60 * 60 * 1000 + 1;
  assert.equal(await service.supportsActive(), true);
  assert.equal(calls, 2);
});

test('并发探测应共用 in-flight 请求', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const service = createService(async () => {
    calls += 1;
    await gate;
    return { ok: true, status: 200 };
  });

  const first = service.supportsActive();
  const second = service.supportsActive();

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
});

test('供应商未配置时不应探测', async () => {
  let calls = 0;
  const service = new ImageCapabilityService(
    {
      resolveActive: async () => ({
        ok: false,
        errorCode: 'PROVIDER_NOT_CONFIGURED',
      }),
    },
    {
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200 };
      },
    },
  );

  assert.equal(await service.supportsActive(), false);
  assert.equal(calls, 0);
});

test('未知结果应短缓存后重试', async () => {
  let now = 1_000;
  let calls = 0;
  const service = createService(
    async () => {
      calls += 1;
      return { ok: false, status: 429 };
    },
    () => now,
  );

  assert.equal(await service.supportsActive(), false);
  assert.equal(await service.supportsActive(), false);
  assert.equal(calls, 1);

  now += 10 * 60 * 1000 + 1;
  assert.equal(await service.supportsActive(), false);
  assert.equal(calls, 2);
});

test('imageInput 为 off 时不应探测或发送', async () => {
  let calls = 0;
  const offConfig = { ...config, imageInput: 'off' };
  const service = new ImageCapabilityService(
    {
      resolveActive: async () => ({ ok: true, config: offConfig }),
      resolve: async () => ({ ok: true, config: offConfig }),
    },
    {
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200 };
      },
      timeoutMs: 50,
    },
  );

  assert.equal(await service.supportsActive(), false);
  assert.deepEqual(await service.probeActive(), {
    ok: true,
    status: 'unsupported',
  });
  assert.equal(calls, 0);
});

test('持久缓存应在 7 天内直接复用', async () => {
  const key = imageCapabilityKey(config.id, config.model, config.baseUrl);
  const cache = {
    value: { [key]: { status: 'supported', checkedAt: 1_000 } },
    read() {
      return this.value;
    },
    write(value) {
      this.value = value;
    },
  };
  let calls = 0;
  const service = createService(
    async () => {
      calls += 1;
      return { ok: true, status: 200 };
    },
    () => 1_000,
    { cache },
  );

  assert.equal(await service.supportsActive(), true);
  assert.equal(calls, 0);
});

test('手动 probe 应绕过缓存并写回持久缓存', async () => {
  const key = imageCapabilityKey(config.id, config.model, config.baseUrl);
  const cache = {
    value: { [key]: { status: 'unsupported', checkedAt: 1_000 } },
    read() {
      return this.value;
    },
    write(value) {
      this.value = value;
    },
  };
  let calls = 0;
  const service = createService(
    async () => {
      calls += 1;
      return { ok: true, status: 200 };
    },
    () => 1_000,
    { cache },
  );

  assert.deepEqual(await service.probeProvider('custom'), {
    ok: true,
    status: 'supported',
  });
  assert.equal(calls, 1);
  assert.equal(cache.value[key].status, 'supported');
});

test('供应商未配置时手动 probe 应返回错误', async () => {
  const service = new ImageCapabilityService(
    {
      resolveActive: async () => ({
        ok: false,
        errorCode: 'PROVIDER_NOT_CONFIGURED',
      }),
      resolve: async () => ({
        ok: false,
        errorCode: 'PROVIDER_NOT_CONFIGURED',
      }),
    },
    { fetchImpl: async () => ({ ok: true, status: 200 }) },
  );

  assert.deepEqual(await service.probeProvider('custom'), {
    ok: false,
    errorCode: 'PROVIDER_NOT_CONFIGURED',
  });
});
