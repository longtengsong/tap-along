import assert from 'node:assert/strict';
import test from 'node:test';
import { PAGE_CHANNELS } from '../src/shared/pages.ts';
import {
  appendPage,
  closePage,
  editPage,
  getPage,
  listPages,
  registerPageHandlers,
  savePage,
} from '../src/main/ipc/pages.ts';

const samplePage = {
  id: 1,
  title: '注意力像带宽',
  body: '注意力像带宽。',
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 0,
  messages: [],
};

test('保存页边时应校验正文并清理出处', () => {
  const calls = [];
  const repository = {
    create(body, source) {
      calls.push({ body, source });
      return samplePage;
    },
  };

  const result = savePage(repository, {
    body: '  注意力像带宽。  ',
    source: ' 课程 ',
  });

  assert.deepEqual(result, { ok: true, page: samplePage });
  assert.deepEqual(calls, [{ body: '注意力像带宽。', source: '课程' }]);
});

test('保存页边时应拒绝无效正文', () => {
  const repository = {
    create() {
      throw new Error('不应调用仓储');
    },
  };

  for (const payload of [null, {}, { body: '' }, { body: '  ' }, { body: 1 }]) {
    assert.deepEqual(savePage(repository, payload), {
      ok: false,
      errorCode: 'INVALID_BODY',
    });
  }
});

test('出处不是字符串时应按空出处保存', () => {
  let receivedSource;
  const repository = {
    create(_body, source) {
      receivedSource = source;
      return samplePage;
    },
  };

  const result = savePage(repository, { body: '笔记', source: 42 });

  assert.equal(result.ok, true);
  assert.equal(receivedSource, '');
});

test('仓储保存失败时应返回统一错误', (t) => {
  t.mock.method(console, 'error', () => {});
  const repository = {
    create() {
      throw new Error('磁盘不可用');
    },
  };

  assert.deepEqual(savePage(repository, { body: '笔记' }), {
    ok: false,
    errorCode: 'SAVE_FAILED',
  });
});

test('读取页边时应返回仓储结果', () => {
  const result = getPage({ findById: () => samplePage }, 1);
  assert.deepEqual(result, { ok: true, page: samplePage });
});

test('读取页边时应处理无效编号和不存在页边', () => {
  const repository = { findById: () => null };

  for (const pageId of [0, -1, 1.5, '1', null]) {
    assert.deepEqual(getPage(repository, pageId), {
      ok: false,
      errorCode: 'INVALID_PAGE_ID',
    });
  }

  assert.deepEqual(getPage(repository, 1), {
    ok: false,
    errorCode: 'PAGE_NOT_FOUND',
  });
});

test('仓储读取失败时应返回统一错误', (t) => {
  t.mock.method(console, 'error', () => {});
  const repository = {
    findById() {
      throw new Error('数据库不可用');
    },
  };

  assert.deepEqual(getPage(repository, 1), {
    ok: false,
    errorCode: 'READ_FAILED',
  });
});

test('列出最近在读页时应校验并限制数量', () => {
  const calls = [];
  const repository = {
    listRecentReading(limit) {
      calls.push(limit);
      return [samplePage];
    },
  };

  assert.deepEqual(listPages(repository, undefined), {
    ok: true,
    pages: [samplePage],
  });
  assert.deepEqual(listPages(repository, { limit: 50 }), {
    ok: true,
    pages: [samplePage],
  });
  assert.deepEqual(calls, [1, 20]);
});

test('列出最近页边时应拒绝无效参数并处理仓储异常', (t) => {
  t.mock.method(console, 'error', () => {});
  const repository = {
    listRecentReading() {
      throw new Error('数据库不可用');
    },
  };

  for (const payload of [null, [], { limit: 0 }, { limit: 1.5 }]) {
    assert.deepEqual(listPages(repository, payload), {
      ok: false,
      errorCode: 'INVALID_LIST_LIMIT',
    });
  }

  assert.deepEqual(listPages(repository, { limit: 1 }), {
    ok: false,
    errorCode: 'LIST_FAILED',
  });
});

test('补一句 IPC 应校验参数并返回规范化页面', () => {
  const calls = [];
  const repository = {
    appendText(pageId, content, requestId) {
      calls.push({ pageId, content, requestId });
      return { ok: true, page: samplePage };
    },
  };

  assert.deepEqual(
    appendPage(repository, {
      pageId: 1,
      content: '  补入内容  ',
      requestId: ' append-1 ',
    }),
    { ok: true, page: samplePage },
  );
  assert.deepEqual(calls, [
    { pageId: 1, content: '补入内容', requestId: 'append-1' },
  ]);
});

test('补一句 IPC 应返回统一错误码', (t) => {
  t.mock.method(console, 'error', () => {});

  assert.deepEqual(appendPage({ appendText: () => null }, null), {
    ok: false,
    errorCode: 'MAINTENANCE_FAILED',
  });
  assert.deepEqual(
    appendPage(
      { appendText: () => ({ ok: false, reason: 'not_found' }) },
      { pageId: 1, content: '内容', requestId: 'append-missing' },
    ),
    { ok: false, errorCode: 'PAGE_NOT_FOUND' },
  );
  assert.deepEqual(
    appendPage(
      { appendText: () => ({ ok: false, reason: 'closed' }) },
      { pageId: 1, content: '内容', requestId: 'append-closed' },
    ),
    { ok: false, errorCode: 'PAGE_CLOSED' },
  );
  assert.deepEqual(
    appendPage(
      {
        appendText() {
          throw new Error('写入失败');
        },
      },
      { pageId: 1, content: '内容', requestId: 'append-failed' },
    ),
    { ok: false, errorCode: 'MAINTENANCE_FAILED' },
  );
});

test('改批注 IPC 应校验参数并返回规范化页面', () => {
  const calls = [];
  const repository = {
    editText(pageId, body, requestId) {
      calls.push({ pageId, body, requestId });
      return { ok: true, page: samplePage };
    },
  };

  assert.deepEqual(
    editPage(repository, {
      pageId: 1,
      body: '  修改后的正文  ',
      requestId: ' edit-1 ',
    }),
    { ok: true, page: samplePage },
  );
  assert.deepEqual(calls, [
    { pageId: 1, body: '修改后的正文', requestId: 'edit-1' },
  ]);
});

test('改批注 IPC 应返回统一错误码', (t) => {
  t.mock.method(console, 'error', () => {});

  assert.deepEqual(editPage({ editText: () => null }, null), {
    ok: false,
    errorCode: 'INVALID_PAGE_ID',
  });
  assert.deepEqual(
    editPage(
      { editText: () => null },
      { pageId: 1, body: ' ', requestId: 'edit-1' },
    ),
    { ok: false, errorCode: 'INVALID_BODY' },
  );
  assert.deepEqual(
    editPage(
      { editText: () => null },
      { pageId: 1, body: '正文', requestId: '' },
    ),
    { ok: false, errorCode: 'MAINTENANCE_FAILED' },
  );
  assert.deepEqual(
    editPage(
      { editText: () => ({ ok: false, reason: 'not_found' }) },
      { pageId: 1, body: '正文', requestId: 'edit-missing' },
    ),
    { ok: false, errorCode: 'PAGE_NOT_FOUND' },
  );
  assert.deepEqual(
    editPage(
      { editText: () => ({ ok: false, reason: 'closed' }) },
      { pageId: 1, body: '正文', requestId: 'edit-closed' },
    ),
    { ok: false, errorCode: 'PAGE_CLOSED' },
  );
  assert.deepEqual(
    editPage(
      {
        editText() {
          throw new Error('写入失败');
        },
      },
      { pageId: 1, body: '正文', requestId: 'edit-failed' },
    ),
    { ok: false, errorCode: 'MAINTENANCE_FAILED' },
  );
});

test('合上页面 IPC 应校验参数并返回关闭页面', () => {
  const calls = [];
  const repository = {
    closePage(pageId, requestId) {
      calls.push({ pageId, requestId });
      return { ok: true, page: { ...samplePage, status: 'closed' } };
    },
  };

  assert.deepEqual(
    closePage(repository, { pageId: 1, requestId: ' close-1 ' }),
    { ok: true, page: { ...samplePage, status: 'closed' } },
  );
  assert.deepEqual(calls, [{ pageId: 1, requestId: 'close-1' }]);
});

test('合上页面 IPC 应返回统一错误码', (t) => {
  t.mock.method(console, 'error', () => {});

  assert.deepEqual(closePage({ closePage: () => null }, null), {
    ok: false,
    errorCode: 'INVALID_PAGE_ID',
  });
  assert.deepEqual(
    closePage({ closePage: () => null }, { pageId: 1, requestId: '' }),
    { ok: false, errorCode: 'MAINTENANCE_FAILED' },
  );
  assert.deepEqual(
    closePage(
      { closePage: () => ({ ok: false, reason: 'not_found' }) },
      { pageId: 1, requestId: 'close-missing' },
    ),
    { ok: false, errorCode: 'PAGE_NOT_FOUND' },
  );
  assert.deepEqual(
    closePage(
      {
        closePage() {
          throw new Error('写入失败');
        },
      },
      { pageId: 1, requestId: 'close-failed' },
    ),
    { ok: false, errorCode: 'MAINTENANCE_FAILED' },
  );
});

test('IPC 注册应暴露保存和读取通道', () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const repository = {
    create: () => samplePage,
    findById: () => samplePage,
    listRecentReading: () => [samplePage],
    appendText: () => ({ ok: true, page: samplePage }),
    editText: () => ({ ok: true, page: samplePage }),
    closePage: () => ({ ok: true, page: { ...samplePage, status: 'closed' } }),
  };

  registerPageHandlers(ipcMain, repository);

  assert.deepEqual(
    new Set(handlers.keys()),
    new Set(Object.values(PAGE_CHANNELS)),
  );
  assert.deepEqual(handlers.get(PAGE_CHANNELS.save)(null, { body: '笔记' }), {
    ok: true,
    page: samplePage,
  });
  assert.deepEqual(handlers.get(PAGE_CHANNELS.get)(null, 1), {
    ok: true,
    page: samplePage,
  });
  assert.deepEqual(handlers.get(PAGE_CHANNELS.list)(null, { limit: 1 }), {
    ok: true,
    pages: [samplePage],
  });
  assert.deepEqual(
    handlers.get(PAGE_CHANNELS.append)(null, {
      pageId: 1,
      content: '补入内容',
      requestId: 'append-1',
    }),
    { ok: true, page: samplePage },
  );
  assert.deepEqual(
    handlers.get(PAGE_CHANNELS.edit)(null, {
      pageId: 1,
      body: '修改后的正文',
      requestId: 'edit-1',
    }),
    { ok: true, page: samplePage },
  );
  assert.deepEqual(
    handlers.get(PAGE_CHANNELS.close)(null, {
      pageId: 1,
      requestId: 'close-1',
    }),
    { ok: true, page: { ...samplePage, status: 'closed' } },
  );
});
