import assert from 'node:assert/strict';
import test from 'node:test';
import { registerSettingsHandlers } from '../src/main/ipc/settings.ts';
import { DeveloperModeService } from '../src/main/services/developer-mode.ts';
import { SETTINGS_CHANNELS } from '../src/shared/settings.ts';

const createFixture = (initialValue = false) => {
  const store = {
    value: initialValue,
    read() {
      return this.value;
    },
    write(value) {
      this.value = value;
    },
  };

  return {
    store,
    service: new DeveloperModeService(store),
  };
};

test('开发者模式默认关闭并持久化切换结果', () => {
  const { store, service } = createFixture();

  assert.deepEqual(service.get(), { ok: true, enabled: false });
  assert.deepEqual(service.set(true), { ok: true, enabled: true });
  assert.equal(store.value, true);
  assert.deepEqual(service.get(), { ok: true, enabled: true });
  assert.deepEqual(service.set(false), { ok: true, enabled: false });
  assert.equal(store.value, false);
});

test('开发者模式拒绝非布尔值', () => {
  const { store, service } = createFixture();

  assert.deepEqual(service.set('true'), {
    ok: false,
    errorCode: 'INVALID_BODY',
  });
  assert.equal(store.value, false);
});

test('开发者模式配置读取失败时返回配置错误', () => {
  const service = new DeveloperModeService({
    read() {
      throw new Error('read failed');
    },
    write() {},
  });

  assert.deepEqual(service.get(), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
});

test('设置处理器应根据开关状态打开或关闭开发者工具', async () => {
  const { service } = createFixture();
  const handlers = new Map();
  const calls = [];
  const sender = {
    openDevTools(options) {
      calls.push(['open', options]);
    },
    closeDevTools() {
      calls.push(['close']);
    },
  };

  registerSettingsHandlers(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    service,
  );

  assert.deepEqual(await handlers.get(SETTINGS_CHANNELS.getDeveloperMode)({}), {
    ok: true,
    enabled: false,
  });
  assert.deepEqual(
    await handlers.get(SETTINGS_CHANNELS.setDeveloperMode)({ sender }, true),
    { ok: true, enabled: true },
  );
  assert.deepEqual(calls, [['open', { mode: 'detach' }]]);

  assert.deepEqual(
    await handlers.get(SETTINGS_CHANNELS.setDeveloperMode)({ sender }, false),
    { ok: true, enabled: false },
  );
  assert.deepEqual(calls, [['open', { mode: 'detach' }], ['close']]);
});
