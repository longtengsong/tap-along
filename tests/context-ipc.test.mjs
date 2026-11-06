import assert from 'node:assert/strict';
import test from 'node:test';
import { registerContextHandlers } from '../src/main/ipc/context.ts';

const page = (id, overrides = {}) => ({
  id,
  parentPageId: null,
  title: `念头 ${id}`,
  body: `正文 ${id}`,
  source: '',
  status: 'reading',
  parseStatus: 'done',
  teachingRoundCount: 0,
  messages: [],
  ...overrides,
});

test('context:list 应返回当前页的上下文念头', () => {
  const current = page(1);
  current.guidance = {
    status: 'needed',
    suggestions: [
      {
        id: 'g-1',
        relatedPageIds: [2],
        notes: [{ pageId: 2, title: '旧念头', source: '', excerpt: '摘录' }],
        why: '因为',
        question: '为什么？',
      },
    ],
    bodyHash: 'hash',
    updatedAt: 1,
  };
  const repository = {
    findById: (pageId) =>
      pageId === 1
        ? current
        : pageId === 2
          ? page(2, { body: '旧念头全文' })
          : null,
    listClosedDescendantBodies: () => [],
  };
  const handlers = new Map();
  registerContextHandlers(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    repository,
  );

  assert.deepEqual(handlers.get('context:list')(null, { pageId: 1 }), {
    ok: true,
    thoughts: [
      {
        pageId: 2,
        title: '念头 2',
        source: '',
        body: '旧念头全文',
        kind: 'line',
      },
    ],
  });
});

test('context:list 应拒绝非法页码并兜底读取错误', () => {
  const handlers = new Map();
  registerContextHandlers(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    {
      findById: () => {
        throw new Error('db down');
      },
      listClosedDescendantBodies: () => [],
    },
  );

  assert.deepEqual(handlers.get('context:list')(null, {}), {
    ok: false,
    errorCode: 'INVALID_PAGE_ID',
  });
  assert.deepEqual(handlers.get('context:list')(null, { pageId: 1 }), {
    ok: true,
    thoughts: [],
  });
});
