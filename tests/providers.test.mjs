import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderConfigService } from '../src/main/services/providers.ts';
import { registerProviderHandlers } from '../src/main/ipc/providers.ts';
import {
  PROVIDER_CHANNELS,
  imageCapabilityKey,
  isValidProviderBaseUrl,
} from '../src/shared/providers.ts';

const createFixture = (available = true) => {
  const store = {
    value: undefined,
    read() {
      return this.value;
    },
    write(value) {
      this.value = value;
    },
  };
  const cipher = {
    available,
    async isAvailable() {
      return this.available;
    },
    async encrypt(value) {
      return `encrypted:${Buffer.from(value).toString('base64')}`;
    },
    async decrypt(value) {
      return Buffer.from(value.replace('encrypted:', ''), 'base64').toString();
    },
  };

  return {
    store,
    cipher,
    service: new ProviderConfigService(store, cipher),
  };
};

test('供应商配置应提供 DeepSeek 和自定义 OpenAI-compatible 默认项', async () => {
  const { service } = createFixture();
  const result = await service.list();

  assert.equal(result.ok, true);
  assert.equal(result.state.activeProvider, 'deepseek');
  assert.equal(result.state.secureStorageAvailable, true);
  assert.deepEqual(result.state.providers, [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
      configured: false,
      active: true,
      isCustom: false,
      imageInput: 'auto',
      imageCapability: 'unknown',
    },
    {
      id: 'custom',
      name: 'Custom provider',
      model: '',
      baseUrl: '',
      configured: false,
      active: false,
      isCustom: true,
      imageInput: 'auto',
      imageCapability: 'unknown',
    },
  ]);
});

test('保存供应商时应加密 API Key 且不向响应暴露密钥', async () => {
  const { store, service } = createFixture();
  const result = await service.save({
    id: 'deepseek',
    model: 'deepseek-chat',
    apiKey: 'sk-secret-value',
  });

  assert.equal(result.ok, true);
  assert.equal(result.state.providers[0].configured, true);
  assert.equal(JSON.stringify(result).includes('sk-secret-value'), false);
  assert.equal(JSON.stringify(store.value).includes('sk-secret-value'), false);
  assert.match(JSON.stringify(store.value), /encrypted:c2stc2VjcmV0LXZhbHVl/);

  const provider = await service.get('deepseek');
  assert.equal(provider.ok, true);
  assert.equal('apiKey' in provider.provider, false);
});

test('自定义供应商应校验 URL、模型和 API Key', async () => {
  const { service } = createFixture();

  assert.equal(isValidProviderBaseUrl('https://api.example.com/v1'), true);
  assert.equal(isValidProviderBaseUrl('http://localhost:11434/v1'), true);
  assert.equal(isValidProviderBaseUrl('http://example.com/v1'), false);
  assert.equal(isValidProviderBaseUrl('ftp://example.com'), false);

  assert.deepEqual(
    await service.save({
      id: 'custom',
      name: 'Local',
      model: '',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'key',
    }),
    { ok: false, errorCode: 'INVALID_MODEL' },
  );
  assert.deepEqual(
    await service.save({
      id: 'custom',
      name: 'Remote',
      model: 'model',
      baseUrl: 'http://example.com/v1',
      apiKey: 'key',
    }),
    { ok: false, errorCode: 'INVALID_BASE_URL' },
  );
  assert.deepEqual(
    await service.save({
      id: 'custom',
      name: 'Local',
      model: 'model',
      baseUrl: 'http://localhost:11434/v1',
    }),
    { ok: false, errorCode: 'API_KEY_REQUIRED' },
  );
});

test('供应商 Key 应按供应商隔离保存和清除', async () => {
  const { service } = createFixture();
  await service.save({
    id: 'deepseek',
    model: 'deepseek-chat',
    apiKey: 'deepseek-key',
  });
  await service.save({
    id: 'custom',
    name: 'Local',
    model: 'local-model',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'local-key',
  });

  const cleared = await service.clearKey('deepseek');
  const deepseek = cleared.state.providers.find(
    (provider) => provider.id === 'deepseek',
  );
  const custom = cleared.state.providers.find(
    (provider) => provider.id === 'custom',
  );
  assert.equal(deepseek.configured, false);
  assert.equal(custom.configured, true);
  assert.equal(custom.model, 'local-model');
});

test('首次配置供应商应自动激活，避免配置完仍停留在演示模式', async () => {
  const { service } = createFixture();

  const first = await service.save({
    id: 'custom',
    name: 'Local',
    model: 'local-model',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'local-key',
  });

  assert.equal(first.ok, true);
  assert.equal(first.state.activeProvider, 'custom');
  assert.equal(
    first.state.providers.find((provider) => provider.id === 'custom').active,
    true,
  );

  const second = await service.save({
    id: 'deepseek',
    model: 'deepseek-chat',
    apiKey: 'deepseek-key',
  });

  assert.equal(second.ok, true);
  assert.equal(second.state.activeProvider, 'custom');
});

test('可以切换激活供应商且重启读取保持一致', async () => {
  const { cipher, service, store } = createFixture();
  await service.save({
    id: 'custom',
    name: 'Local',
    model: 'local-model',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'local-key',
  });
  const active = await service.setActive('custom');
  assert.equal(active.ok, true);
  assert.equal(active.state.activeProvider, 'custom');
  assert.equal(
    active.state.providers.find((provider) => provider.id === 'custom').active,
    true,
  );

  const reloaded = await new ProviderConfigService(store, cipher).list();
  assert.equal(reloaded.state.activeProvider, 'custom');
  assert.equal(
    reloaded.state.providers.find((provider) => provider.id === 'custom')
      .configured,
    true,
  );
});

test('安全存储不可用时应拒绝保存新 Key', async () => {
  const { service, store } = createFixture(false);

  const result = await service.save({
    id: 'deepseek',
    model: 'deepseek-chat',
    apiKey: 'secret',
  });

  assert.deepEqual(result, {
    ok: false,
    errorCode: 'SECURE_STORAGE_UNAVAILABLE',
  });
  assert.equal(store.value, undefined);
  assert.equal((await service.list()).state.secureStorageAvailable, false);
});

test('更新非敏感配置时应保留已有加密 Key', async () => {
  const { service } = createFixture();
  await service.save({
    id: 'deepseek',
    model: 'deepseek-chat',
    apiKey: 'existing-key',
  });

  const updated = await service.save({
    id: 'deepseek',
    model: 'deepseek-reasoner',
    apiKey: '',
  });

  assert.equal(updated.ok, true);
  assert.equal(updated.state.providers[0].model, 'deepseek-reasoner');
  assert.equal(updated.state.providers[0].configured, true);
});

test('运行时配置应解密 Key，并拒绝缺省或无法解密的配置', async () => {
  const { cipher, service, store } = createFixture();

  assert.deepEqual(await service.resolve('deepseek'), {
    ok: false,
    errorCode: 'PROVIDER_NOT_CONFIGURED',
  });
  assert.deepEqual(await service.resolve('unknown'), {
    ok: false,
    errorCode: 'INVALID_PROVIDER',
  });

  await service.save({
    id: 'deepseek',
    model: 'deepseek-chat',
    apiKey: 'runtime-secret',
  });
  assert.deepEqual(await service.resolve('deepseek'), {
    ok: true,
    config: {
      id: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKey: 'runtime-secret',
      imageInput: 'auto',
    },
  });
  assert.equal(
    JSON.stringify(await service.resolve('deepseek')).includes(
      'runtime-secret',
    ),
    true,
  );

  store.value.providers.custom = {
    name: 'Custom',
    model: '   ',
    baseUrl: 'https://example.com/v1',
    encryptedApiKey: 'encrypted:u2VjcmV0',
  };
  assert.deepEqual(await service.resolve('custom'), {
    ok: false,
    errorCode: 'INVALID_MODEL',
  });

  cipher.decrypt = async () => {
    throw new Error('解密失败');
  };
  store.value.providers.custom.model = 'custom-model';
  assert.deepEqual(await service.resolve('custom'), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
});

test('应使用当前激活供应商的运行时配置，并在读取失败时返回统一错误', async () => {
  const { service, store } = createFixture();

  assert.deepEqual(await service.resolveActive(), {
    ok: false,
    errorCode: 'PROVIDER_NOT_CONFIGURED',
  });

  await service.save({
    id: 'custom',
    name: 'Local',
    model: 'local-model',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'local-key',
  });
  await service.setActive('custom');

  assert.deepEqual(await service.resolveActive(), {
    ok: true,
    config: {
      id: 'custom',
      baseUrl: 'http://localhost:11434/v1',
      model: 'local-model',
      apiKey: 'local-key',
      imageInput: 'auto',
    },
  });

  store.read = () => {
    throw new Error('读取失败');
  };
  assert.deepEqual(await service.resolveActive(), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
});

test('供应商服务应处理非法输入和存储异常', async () => {
  const { service, store } = createFixture();

  assert.deepEqual(await service.get('unknown'), {
    ok: false,
    errorCode: 'INVALID_PROVIDER',
  });
  assert.deepEqual(await service.save(null), {
    ok: false,
    errorCode: 'INVALID_PROVIDER',
  });
  assert.deepEqual(await service.clearKey('unknown'), {
    ok: false,
    errorCode: 'INVALID_PROVIDER',
  });
  assert.deepEqual(await service.setActive('unknown'), {
    ok: false,
    errorCode: 'INVALID_PROVIDER',
  });

  store.read = () => {
    throw new Error('读取失败');
  };
  assert.deepEqual(await service.list(), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
  assert.deepEqual(await service.get('deepseek'), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });

  store.read = () => undefined;
  store.write = () => {
    throw new Error('写入失败');
  };
  assert.deepEqual(
    await service.save({
      id: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'key',
    }),
    { ok: false, errorCode: 'CONFIG_FAILED' },
  );
  assert.deepEqual(await service.setActive('custom'), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
});

test('异常存储结构和安全存储异常应安全回退', async () => {
  const { cipher, store } = createFixture();
  store.value = {
    activeProvider: 'invalid',
    providers: {
      deepseek: { model: 7, name: null, baseUrl: 'invalid' },
      custom: 'invalid',
    },
  };
  const service = new ProviderConfigService(store, cipher);
  const state = (await service.list()).state;

  assert.equal(state.activeProvider, 'deepseek');
  assert.equal(state.providers[0].model, 'deepseek-chat');
  assert.equal(state.providers[1].name, 'Custom provider');

  cipher.isAvailable = async () => {
    throw new Error('安全存储检查失败');
  };
  const failed = await service.save({
    id: 'custom',
    name: 'Custom',
    model: 'model',
    baseUrl: 'https://example.com/v1',
    apiKey: 'key',
  });
  assert.deepEqual(failed, {
    ok: false,
    errorCode: 'SECURE_STORAGE_UNAVAILABLE',
  });
});

test('供应商 IPC 应只暴露窄接口', () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const expected = { ok: true, state: { providers: [] } };
  const service = {
    list: () => expected,
    get: (id) => ({ ok: true, id }),
    save: (payload) => ({ ok: true, payload }),
    clearKey: (id) => ({ ok: true, id }),
    setActive: (id) => ({ ok: true, id }),
  };
  const connectionService = {
    test: (id) => ({ ok: true, id }),
  };
  const imageCapabilities = {
    probeProvider: (id) => ({ ok: true, status: 'supported', id }),
  };

  registerProviderHandlers(
    ipcMain,
    service,
    connectionService,
    imageCapabilities,
  );

  assert.deepEqual(
    new Set(handlers.keys()),
    new Set(Object.values(PROVIDER_CHANNELS)),
  );
  assert.equal(handlers.get(PROVIDER_CHANNELS.list)(), expected);
  assert.deepEqual(handlers.get(PROVIDER_CHANNELS.get)(null, 'deepseek'), {
    ok: true,
    id: 'deepseek',
  });
  assert.deepEqual(
    handlers.get(PROVIDER_CHANNELS.save)(null, {
      id: 'deepseek',
      model: 'deepseek-chat',
    }),
    {
      ok: true,
      payload: { id: 'deepseek', model: 'deepseek-chat' },
    },
  );
  assert.deepEqual(handlers.get(PROVIDER_CHANNELS.clearKey)(null, 'custom'), {
    ok: true,
    id: 'custom',
  });
  assert.deepEqual(handlers.get(PROVIDER_CHANNELS.setActive)(null, 'custom'), {
    ok: true,
    id: 'custom',
  });
  assert.deepEqual(
    handlers.get(PROVIDER_CHANNELS.probeImages)(null, 'custom'),
    { ok: true, status: 'supported', id: 'custom' },
  );
  assert.deepEqual(handlers.get(PROVIDER_CHANNELS.test)(null, 'deepseek'), {
    ok: true,
    id: 'deepseek',
  });
});

test('图片输入开关应默认自动并可保存为不发送', async () => {
  const { service } = createFixture();

  await service.save({
    id: 'custom',
    name: 'Local',
    model: 'local-model',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'local-key',
    imageInput: 'off',
  });

  const state = await service.list();
  const provider = state.state.providers.find((item) => item.id === 'custom');
  assert.equal(provider.imageInput, 'off');

  const resolved = await service.resolve('custom');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.config.imageInput, 'off');
});

test('图片能力缓存应持久化并在保存/清 Key 时失效', async () => {
  const { service } = createFixture();

  await service.save({
    id: 'custom',
    name: 'Local',
    model: 'local-model',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'local-key',
  });

  const key = imageCapabilityKey(
    'custom',
    'local-model',
    'http://localhost:11434/v1',
  );
  service.writeImageCapabilityCache({
    [key]: { status: 'supported', checkedAt: 1 },
  });

  const before = await service.list();
  assert.equal(
    before.state.providers.find((item) => item.id === 'custom').imageCapability,
    'supported',
  );

  await service.save({
    id: 'custom',
    name: 'Local',
    model: 'new-model',
    baseUrl: 'http://localhost:11434/v1',
  });

  const afterModelChange = await service.list();
  assert.equal(
    afterModelChange.state.providers.find((item) => item.id === 'custom')
      .imageCapability,
    'unknown',
  );

  const newKey = imageCapabilityKey(
    'custom',
    'new-model',
    'http://localhost:11434/v1',
  );
  service.writeImageCapabilityCache({
    [newKey]: { status: 'unsupported', checkedAt: 1 },
  });
  await service.clearKey('custom');

  const afterClear = await service.list();
  assert.equal(
    afterClear.state.providers.find((item) => item.id === 'custom')
      .imageCapability,
    'unknown',
  );
});
