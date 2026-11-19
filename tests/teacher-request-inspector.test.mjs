import assert from 'node:assert/strict';
import test from 'node:test';
import { TeacherRequestInspector } from '../src/main/services/teacher-request-inspector.ts';

const createFixture = ({ enabled = true, maxEntries = 20 } = {}) => {
  const developerMode = {
    enabled,
    get() {
      return { ok: true, enabled: this.enabled };
    },
  };

  return {
    developerMode,
    inspector: new TeacherRequestInspector(developerMode, maxEntries),
  };
};

const messages = [
  { role: 'system', content: 'system prompt' },
  { role: 'user', content: 'user prompt' },
];

test('开发者请求检查器应保存发送给 LLM 的消息和模型信息', () => {
  const { inspector } = createFixture();

  inspector.recordSent({
    requestId: 'request-1',
    providerId: 'deepseek',
    model: 'deepseek-chat',
    messages,
    promptVersion: 'companion-v2.0.0',
    promptHash: 'abc123',
    temperature: 0,
  });

  const result = inspector.get('request-1');
  assert.equal(result.ok, true);
  assert.equal(result.request.requestId, 'request-1');
  assert.equal(result.request.status, 'sent');
  assert.equal(result.request.providerId, 'deepseek');
  assert.equal(result.request.model, 'deepseek-chat');
  assert.equal(result.request.promptVersion, 'companion-v2.0.0');
  assert.equal(result.request.promptHash, 'abc123');
  assert.equal(result.request.temperature, 0);
  assert.deepEqual(result.request.messages, messages);
});

test('请求正常完成时应回写回复与耗时', () => {
  const { inspector } = createFixture();

  inspector.recordSent({
    requestId: 'completed-1',
    providerId: 'custom',
    model: 'model',
    messages,
  });
  inspector.recordCompleted('completed-1', {
    reply: '这条回复？',
    latencyMs: 321.4,
  });

  const completed = inspector.get('completed-1').request;
  assert.equal(completed.status, 'sent');
  assert.equal(completed.reply, '这条回复？');
  assert.equal(completed.latencyMs, 321);

  inspector.recordCompleted('missing-request', {
    reply: '不应写入',
    latencyMs: 10,
  });
  assert.equal(inspector.get('missing-request').request, undefined);

  inspector.recordCompleted('completed-1', { reply: '   ', latencyMs: 5 });
  assert.equal(inspector.get('completed-1').request.reply, '这条回复？');
});

test('开发者请求检查器应记录失败和本地回退状态', () => {
  const { inspector } = createFixture();

  inspector.recordSent({
    requestId: 'failed-1',
    providerId: 'custom',
    model: 'model',
    messages,
  });
  inspector.recordFailed('failed-1', 'PROVIDER_TIMEOUT');
  assert.equal(inspector.get('failed-1').request.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(inspector.get('failed-1').request.status, 'failed');

  inspector.recordFallback('fallback-1');
  const fallback = inspector.get('fallback-1').request;
  assert.equal(fallback.requestId, 'fallback-1');
  assert.equal(fallback.status, 'fallback');
  assert.deepEqual(fallback.messages, []);
  assert.equal(typeof fallback.createdAt, 'number');
});

test('开发者请求检查器应限制内存记录数量', () => {
  const { inspector } = createFixture({ maxEntries: 2 });

  for (const requestId of ['one', 'two', 'three']) {
    inspector.recordSent({
      requestId,
      providerId: 'custom',
      model: 'model',
      messages,
    });
  }

  assert.equal(inspector.get('one').request, undefined);
  assert.equal(inspector.get('two').request.requestId, 'two');
  assert.equal(inspector.get('three').request.requestId, 'three');
});

test('开发者模式关闭时不记录且拒绝检查请求', () => {
  const { developerMode, inspector } = createFixture({ enabled: false });

  inspector.recordSent({
    requestId: 'request-1',
    providerId: 'custom',
    model: 'model',
    messages,
  });
  assert.deepEqual(inspector.get('request-1'), {
    ok: false,
    errorCode: 'DEVELOPER_MODE_REQUIRED',
  });

  developerMode.enabled = true;
  assert.equal(inspector.get('request-1').request, undefined);
  assert.deepEqual(inspector.get(''), {
    ok: false,
    errorCode: 'TEACHER_INVALID_REQUEST',
  });
});

test('请求记录应持久化，重启后仍可按 requestId 读取', async (t) => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { openDatabase, allocateDatabasePath, closeDatabase } =
    await import('../src/main/db/client.ts');
  const { RequestInspectionRepository } =
    await import('../src/main/db/request-inspections.ts');
  const directory = await mkdtemp(
    path.join(tmpdir(), 'tap-along-request-inspection-'),
  );
  const db = openDatabase(allocateDatabasePath(directory));
  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });
  const store = new RequestInspectionRepository(db);
  const developerMode = {
    get() {
      return { ok: true, enabled: true };
    },
  };
  const first = new TeacherRequestInspector(developerMode, 2, store);

  first.recordSent({
    requestId: 'persisted-1',
    providerId: 'custom',
    model: 'persisted-model',
    messages,
  });

  const second = new TeacherRequestInspector(developerMode, 2, store);
  second.recordCompleted('persisted-1', {
    reply: '持久化回复？',
    latencyMs: 88,
  });
  const saved = second.get('persisted-1').request;
  assert.equal(saved.requestId, 'persisted-1');
  assert.equal(saved.status, 'sent');
  assert.equal(saved.providerId, 'custom');
  assert.equal(saved.model, 'persisted-model');
  assert.equal(saved.reply, '持久化回复？');
  assert.equal(saved.latencyMs, 88);
  assert.deepEqual(saved.messages, messages);

  second.recordFailed('persisted-1', 'PROVIDER_TIMEOUT');
  const third = new TeacherRequestInspector(developerMode, 2, store);
  const failed = third.get('persisted-1').request;
  assert.equal(failed.status, 'failed');
  assert.equal(failed.errorCode, 'PROVIDER_TIMEOUT');
});

test('持久化记录也应按数量上限清理最旧的一批', async (t) => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { openDatabase, allocateDatabasePath, closeDatabase } =
    await import('../src/main/db/client.ts');
  const { RequestInspectionRepository } =
    await import('../src/main/db/request-inspections.ts');
  const directory = await mkdtemp(
    path.join(tmpdir(), 'tap-along-request-prune-'),
  );
  const db = openDatabase(allocateDatabasePath(directory));
  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });
  const store = new RequestInspectionRepository(db);
  const developerMode = {
    get() {
      return { ok: true, enabled: true };
    },
  };
  const first = new TeacherRequestInspector(developerMode, 2, store);

  for (const requestId of ['one', 'two', 'three']) {
    first.recordSent({
      requestId,
      providerId: 'custom',
      model: 'model',
      messages,
    });
  }

  const second = new TeacherRequestInspector(developerMode, 2, store);
  assert.equal(second.get('one').request, undefined);
  assert.equal(second.get('two').request.requestId, 'two');
  assert.equal(second.get('three').request.requestId, 'three');
});
