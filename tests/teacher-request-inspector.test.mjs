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
  });

  const result = inspector.get('request-1');
  assert.equal(result.ok, true);
  assert.equal(result.request.requestId, 'request-1');
  assert.equal(result.request.status, 'sent');
  assert.equal(result.request.providerId, 'deepseek');
  assert.equal(result.request.model, 'deepseek-chat');
  assert.deepEqual(result.request.messages, messages);
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
