import assert from 'node:assert/strict';
import test from 'node:test';
import { SearchConfigService } from '../src/main/services/search-config.ts';

const createCipher = ({ available = true, fail = false } = {}) => ({
  async isAvailable() {
    return available;
  },
  async encrypt(value) {
    if (fail) throw new Error('cipher down');
    return `enc:${value}`;
  },
  async decrypt(value) {
    if (fail) throw new Error('cipher down');
    return value.startsWith('enc:') ? value.slice(4) : value;
  },
});

const createStore = (initial = undefined) => {
  let value = initial;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
    get value() {
      return value;
    },
  };
};

test('搜索配置默认启用但未配置 Key', async () => {
  const service = new SearchConfigService(createStore(), createCipher());
  const result = await service.get();

  assert.equal(result.ok, true);
  assert.equal(result.settings.enabled, true);
  assert.equal(result.settings.provider, 'tavily');
  assert.equal(result.settings.configured, false);
  assert.equal(result.settings.secureStorageAvailable, true);
});

test('保存搜索配置应加密 Key 且不向响应暴露明文', async () => {
  const store = createStore();
  const service = new SearchConfigService(store, createCipher());
  const result = await service.save({
    enabled: true,
    apiKey: 'tvly-secret',
  });

  assert.equal(result.ok, true);
  assert.equal(result.settings.configured, true);
  assert.equal(JSON.stringify(result).includes('tvly-secret'), false);
  assert.equal(store.value.encryptedApiKey, 'enc:tvly-secret');
  assert.equal(store.value.enabled, true);
});

test('只切换开关时应保留已有 Key', async () => {
  const store = createStore({
    enabled: true,
    provider: 'tavily',
    encryptedApiKey: 'enc:old',
  });
  const service = new SearchConfigService(store, createCipher());

  const result = await service.save({ enabled: false });
  assert.equal(result.ok, true);
  assert.equal(result.settings.enabled, false);
  assert.equal(result.settings.configured, true);
  assert.equal(store.value.encryptedApiKey, 'enc:old');
});

test('清除 Key 应保留启用状态', async () => {
  const store = createStore({
    enabled: false,
    provider: 'tavily',
    encryptedApiKey: 'enc:old',
  });
  const service = new SearchConfigService(store, createCipher());

  const result = await service.clearKey();
  assert.equal(result.ok, true);
  assert.equal(result.settings.enabled, false);
  assert.equal(result.settings.configured, false);
  assert.equal(store.value.encryptedApiKey, undefined);
});

test('安全存储不可用时应拒绝保存新 Key', async () => {
  const service = new SearchConfigService(
    createStore(),
    createCipher({ available: false }),
  );
  const result = await service.save({ enabled: true, apiKey: 'secret' });

  assert.deepEqual(result, {
    ok: false,
    errorCode: 'SECURE_STORAGE_UNAVAILABLE',
  });
});

test('配置异常时应返回统一错误', async () => {
  const service = new SearchConfigService(
    {
      read() {
        throw new Error('read down');
      },
      write() {},
    },
    createCipher(),
  );

  assert.deepEqual(await service.get(), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
  assert.deepEqual(await service.clearKey(), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
  assert.deepEqual(await service.resolve(), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
});

test('加密失败时应返回配置错误', async () => {
  const service = new SearchConfigService(
    createStore(),
    createCipher({ fail: true }),
  );
  const result = await service.save({ enabled: true, apiKey: 'secret' });

  assert.deepEqual(result, {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
});

test('resolve 应区分关闭、未配置和可用三种状态', async () => {
  const disabled = new SearchConfigService(
    createStore({ enabled: false, provider: 'tavily' }),
    createCipher(),
  );
  assert.deepEqual(await disabled.resolve(), {
    ok: false,
    errorCode: 'SEARCH_DISABLED',
  });

  const missing = new SearchConfigService(
    createStore({ enabled: true, provider: 'tavily' }),
    createCipher(),
  );
  assert.deepEqual(await missing.resolve(), {
    ok: false,
    errorCode: 'SEARCH_NOT_CONFIGURED',
  });

  const ready = new SearchConfigService(
    createStore({
      enabled: true,
      provider: 'tavily',
      encryptedApiKey: 'enc:key',
    }),
    createCipher(),
  );
  assert.deepEqual(await ready.resolve(), { ok: true, apiKey: 'key' });
});

test('非法保存参数和异常历史结构应安全处理', async () => {
  const service = new SearchConfigService(
    createStore('not-an-object'),
    createCipher(),
  );

  for (const payload of [null, {}, [], { enabled: 1 }]) {
    assert.deepEqual(await service.save(payload), {
      ok: false,
      errorCode: 'CONFIG_FAILED',
    });
  }

  const result = await service.get();
  assert.equal(result.ok, true);
  assert.equal(result.settings.enabled, true);
});
