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

const createService = ({
  store = createStore(),
  cipher = createCipher(),
  deepseekKey = null,
  deepseekKeyProvider,
} = {}) =>
  new SearchConfigService(store, cipher, {
    deepseekKeyProvider: deepseekKeyProvider ?? (async () => deepseekKey),
  });

test('默认启用 DeepSeek 检索，且尚未配置任何 Key', async () => {
  const service = createService();
  const result = await service.get();

  assert.equal(result.ok, true);
  assert.equal(result.settings.enabled, true);
  assert.equal(result.settings.deepseekEnabled, true);
  assert.equal(result.settings.provider, 'deepseek');
  assert.equal(result.settings.deepseekConfigured, false);
  assert.equal(result.settings.tavilyConfigured, false);
  assert.equal(result.settings.configured, false);
  assert.equal(result.settings.secureStorageAvailable, true);
});

test('保存 Tavily Key 应加密且不向响应暴露明文', async () => {
  const store = createStore();
  const service = createService({ store });
  const result = await service.save({
    enabled: true,
    deepseekEnabled: false,
    apiKey: 'tvly-secret',
  });

  assert.equal(result.ok, true);
  assert.equal(result.settings.tavilyConfigured, true);
  assert.equal(result.settings.configured, true);
  assert.equal(JSON.stringify(result).includes('tvly-secret'), false);
  assert.equal(store.value.encryptedApiKey, 'enc:tvly-secret');
  assert.equal(store.value.enabled, true);
  assert.equal(store.value.deepseekEnabled, false);
});

test('只切换开关时应保留已有 Key', async () => {
  const store = createStore({
    enabled: true,
    deepseekEnabled: false,
    provider: 'tavily',
    encryptedApiKey: 'enc:old',
  });
  const service = createService({ store });

  const result = await service.save({ enabled: false });
  assert.equal(result.ok, true);
  assert.equal(result.settings.enabled, false);
  assert.equal(result.settings.tavilyConfigured, true);
  assert.equal(store.value.encryptedApiKey, 'enc:old');
});

test('清除 Key 应保留启用状态', async () => {
  const store = createStore({
    enabled: false,
    deepseekEnabled: false,
    provider: 'tavily',
    encryptedApiKey: 'enc:old',
  });
  const service = createService({ store });

  const result = await service.clearKey();
  assert.equal(result.ok, true);
  assert.equal(result.settings.enabled, false);
  assert.equal(result.settings.tavilyConfigured, false);
  assert.equal(store.value.encryptedApiKey, undefined);
});

test('安全存储不可用时应拒绝保存新 Key', async () => {
  const service = createService({ cipher: createCipher({ available: false }) });
  const result = await service.save({ enabled: true, apiKey: 'secret' });

  assert.deepEqual(result, {
    ok: false,
    errorCode: 'SECURE_STORAGE_UNAVAILABLE',
  });
});

test('配置异常时应返回统一错误', async () => {
  const service = createService({
    store: {
      read() {
        throw new Error('read down');
      },
      write() {},
    },
  });

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
  const service = createService({ cipher: createCipher({ fail: true }) });
  const result = await service.save({ enabled: true, apiKey: 'secret' });

  assert.deepEqual(result, {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
});

test('resolve 应区分关闭、未配置和可用三种状态', async () => {
  const disabled = createService({
    store: createStore({ enabled: false, deepseekEnabled: true }),
  });
  assert.deepEqual(await disabled.resolve(), {
    ok: false,
    errorCode: 'SEARCH_DISABLED',
  });

  const missing = createService({
    store: createStore({ enabled: true, deepseekEnabled: true }),
  });
  assert.deepEqual(await missing.resolve(), {
    ok: false,
    errorCode: 'SEARCH_NOT_CONFIGURED',
  });

  const tavilyOnly = createService({
    store: createStore({
      enabled: true,
      deepseekEnabled: true,
      encryptedApiKey: 'enc:key',
    }),
  });
  assert.deepEqual(await tavilyOnly.resolve(), {
    ok: true,
    provider: 'tavily',
    apiKey: 'key',
  });
});

test('DeepSeek Key 可用时应优先使用，并把 Tavily 作为回退', async () => {
  const service = createService({
    store: createStore({
      enabled: true,
      deepseekEnabled: true,
      encryptedApiKey: 'enc:tvly',
    }),
    deepseekKey: 'ds-key',
  });

  assert.deepEqual(await service.resolve(), {
    ok: true,
    provider: 'deepseek',
    apiKey: 'ds-key',
    fallback: { provider: 'tavily', apiKey: 'tvly' },
  });

  const settings = await service.get();
  assert.equal(settings.settings.deepseekConfigured, true);
  assert.equal(settings.settings.tavilyConfigured, true);
  assert.equal(settings.settings.configured, true);
});

test('关闭 DeepSeek 开关后不应再使用 DeepSeek Key', async () => {
  const service = createService({
    store: createStore({
      enabled: true,
      deepseekEnabled: false,
      encryptedApiKey: 'enc:tvly',
    }),
    deepseekKey: 'ds-key',
  });

  assert.deepEqual(await service.resolve(), {
    ok: true,
    provider: 'tavily',
    apiKey: 'tvly',
  });

  const settings = await service.get();
  assert.equal(settings.settings.deepseekEnabled, false);
  assert.equal(settings.settings.provider, 'tavily');
});

test('DeepSeek Key 读取失败时应安全降级', async () => {
  const service = createService({
    store: createStore({
      enabled: true,
      deepseekEnabled: true,
      encryptedApiKey: 'enc:tvly',
    }),
    deepseekKeyProvider: async () => {
      throw new Error('provider down');
    },
  });

  assert.deepEqual(await service.resolve(), {
    ok: true,
    provider: 'tavily',
    apiKey: 'tvly',
  });
  assert.equal((await service.get()).ok, true);
});

test('非法保存参数和异常历史结构应安全处理', async () => {
  const service = createService({ store: createStore('not-an-object') });

  for (const payload of [
    null,
    {},
    [],
    { enabled: 1 },
    { enabled: true, deepseekEnabled: 'yes' },
  ]) {
    assert.deepEqual(await service.save(payload), {
      ok: false,
      errorCode: 'CONFIG_FAILED',
    });
  }

  const result = await service.get();
  assert.equal(result.ok, true);
  assert.equal(result.settings.enabled, true);
});

test('关闭 DeepSeek 开关且没有 Tavily Key 时应视为未配置', async () => {
  const service = createService({
    store: createStore({ enabled: true, deepseekEnabled: false }),
    deepseekKey: 'ds-key',
  });

  assert.deepEqual(await service.resolve(), {
    ok: false,
    errorCode: 'SEARCH_NOT_CONFIGURED',
  });

  const view = await service.get();
  assert.equal(view.settings.deepseekConfigured, true);
  assert.equal(view.settings.tavilyConfigured, false);
  assert.equal(view.settings.configured, false);
});
