import assert from 'node:assert/strict';
import test from 'node:test';
import { registerDeveloperPromptHandlers } from '../src/main/ipc/developer-prompts.ts';
import { DeveloperPromptConfigService } from '../src/main/services/developer-prompts.ts';
import { PROMPT_CATALOG, PROMPT_VERSION } from '../src/main/prompts/index.ts';
import { DEVELOPER_PROMPTS_CHANNELS } from '../src/shared/prompts.ts';

const createFixture = ({ enabled = true, storedValue = undefined } = {}) => {
  const developerMode = {
    enabled,
    result: undefined,
    get() {
      return this.result ?? { ok: true, enabled: this.enabled };
    },
  };
  const store = {
    value: storedValue,
    read() {
      return this.value;
    },
    write(profile) {
      this.value = profile;
    },
    clear() {
      this.value = undefined;
    },
  };

  return {
    developerMode,
    store,
    service: new DeveloperPromptConfigService(developerMode, store),
  };
};

test('开发者模式关闭时应使用内置提示词', () => {
  const { service } = createFixture({ enabled: false });

  assert.deepEqual(service.get(), {
    ok: true,
    prompts: PROMPT_CATALOG,
    defaultPrompts: PROMPT_CATALOG,
    basePromptVersion: PROMPT_VERSION,
    hasSavedProfile: false,
  });
  assert.equal(service.resolve(), PROMPT_CATALOG);
});

test('开发者 Prompt 配置应在开发者模式关闭时拒绝修改', () => {
  const { store, service } = createFixture({ enabled: false });

  assert.deepEqual(service.save(PROMPT_CATALOG), {
    ok: false,
    errorCode: 'DEVELOPER_MODE_REQUIRED',
  });
  assert.deepEqual(service.reset(), {
    ok: false,
    errorCode: 'DEVELOPER_MODE_REQUIRED',
  });
  assert.equal(store.value, undefined);
});

test('开发者模式应保存完整提示词并从后续请求中读取', () => {
  const { store, service } = createFixture();
  const prompts = structuredClone(PROMPT_CATALOG);
  prompts.provider.connectionTest = 'Custom connection check.';
  prompts.teacher.system = 'Custom teacher.';
  prompts.teacher.context.currentPage =
    '<custom_page>{{title}}|{{body}}</custom_page>';

  const saved = service.save(prompts);

  assert.equal(saved.ok, true);
  assert.equal(saved.hasSavedProfile, true);
  assert.equal(saved.basePromptVersion, PROMPT_VERSION);
  assert.deepEqual(saved.prompts, prompts);
  assert.deepEqual(saved.defaultPrompts, PROMPT_CATALOG);
  assert.equal(store.value.schemaVersion, 1);
  assert.equal(store.value.prompts.teacher.system, 'Custom teacher.');
  assert.deepEqual(service.resolve(), prompts);

  const loaded = service.get();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.hasSavedProfile, true);
  assert.deepEqual(loaded.prompts, prompts);
  assert.deepEqual(loaded.defaultPrompts, PROMPT_CATALOG);
});

test('开发者 Prompt 配置应拒绝缺失字段和非法结构', () => {
  const { service } = createFixture();

  for (const invalid of [
    null,
    [],
    {},
    { provider: {}, teacher: {} },
    {
      provider: { connectionTest: 'ok' },
      teacher: {
        system: 'ok',
        languagePolicy: 'ok',
        resume: 'ok',
        maintenance: 'ok',
        contextBoundary: 'ok',
        compressedContextPolicy: 'ok',
        context: {
          currentPage: 'ok',
          closedPage: 'ok',
        },
        maintenanceAction: { edit: 'ok', append: 'ok' },
      },
    },
  ]) {
    assert.deepEqual(service.save(invalid), {
      ok: false,
      errorCode: 'INVALID_PROMPT_PROFILE',
    });
  }
});

test('开发者 Prompt 配置应拒绝超过长度限制的内容', () => {
  const { service } = createFixture();
  const prompts = structuredClone(PROMPT_CATALOG);
  prompts.teacher.system = 'x'.repeat(64_001);

  assert.deepEqual(service.save(prompts), {
    ok: false,
    errorCode: 'PROMPT_PROFILE_TOO_LARGE',
  });
});

test('恢复默认应删除用户配置并返回内置提示词', () => {
  const { store, service } = createFixture();
  const prompts = structuredClone(PROMPT_CATALOG);
  prompts.teacher.system = 'Custom teacher.';
  service.save(prompts);

  const result = service.reset();

  assert.deepEqual(result, {
    ok: true,
    prompts: PROMPT_CATALOG,
    defaultPrompts: PROMPT_CATALOG,
    basePromptVersion: PROMPT_VERSION,
    hasSavedProfile: false,
  });
  assert.equal(store.value, undefined);
  assert.equal(service.resolve(), PROMPT_CATALOG);
});

test('损坏的已保存配置应安全回退到内置提示词', () => {
  const { service } = createFixture({
    storedValue: {
      schemaVersion: 1,
      basePromptVersion: PROMPT_VERSION,
      prompts: { teacher: {} },
      updatedAt: new Date().toISOString(),
    },
  });

  const result = service.get();
  assert.equal(result.ok, true);
  assert.equal(result.hasSavedProfile, false);
  assert.equal(result.prompts, PROMPT_CATALOG);
  assert.equal(result.defaultPrompts, PROMPT_CATALOG);
  assert.equal(service.resolve(), PROMPT_CATALOG);
});

test('配置存储异常应返回统一错误并安全回退', () => {
  const readFailure = new DeveloperPromptConfigService(
    { get: () => ({ ok: true, enabled: true }) },
    {
      read() {
        throw new Error('read failed');
      },
      write() {},
      clear() {},
    },
  );

  assert.deepEqual(readFailure.get(), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
  assert.equal(readFailure.resolve(), PROMPT_CATALOG);

  const writeFailure = new DeveloperPromptConfigService(
    { get: () => ({ ok: true, enabled: true }) },
    {
      read() {
        return undefined;
      },
      write() {
        throw new Error('write failed');
      },
      clear() {},
    },
  );
  assert.deepEqual(writeFailure.save(PROMPT_CATALOG), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });

  const clearFailure = new DeveloperPromptConfigService(
    { get: () => ({ ok: true, enabled: true }) },
    {
      read() {
        return undefined;
      },
      write() {},
      clear() {
        throw new Error('clear failed');
      },
    },
  );
  assert.deepEqual(clearFailure.reset(), {
    ok: false,
    errorCode: 'CONFIG_FAILED',
  });
});

test('开发者 Prompt IPC 应暴露读取、保存和恢复默认通道', async () => {
  const { service } = createFixture();
  const handlers = new Map();

  registerDeveloperPromptHandlers(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    service,
  );

  assert.deepEqual(
    await handlers.get(DEVELOPER_PROMPTS_CHANNELS.get)({}),
    service.get(),
  );
  const prompts = structuredClone(PROMPT_CATALOG);
  prompts.teacher.system = 'IPC custom teacher.';
  assert.equal(
    (await handlers.get(DEVELOPER_PROMPTS_CHANNELS.save)({}, prompts)).ok,
    true,
  );
  assert.equal(service.resolve().teacher.system, 'IPC custom teacher.');
  assert.equal(
    (await handlers.get(DEVELOPER_PROMPTS_CHANNELS.reset)({})).ok,
    true,
  );
  assert.equal(service.resolve(), PROMPT_CATALOG);
});
