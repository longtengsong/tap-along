import assert from 'node:assert/strict';
import test from 'node:test';
import { PAGE_CHANNELS, TITLE_CHANNELS } from '../src/shared/pages.ts';
import {
  appendPage,
  clearAllPages,
  closePage,
  editPage,
  getPage,
  listClosedPages,
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
    create(body, source, openingMessage, parentPageId) {
      calls.push({ body, source, openingMessage, parentPageId });
      return samplePage;
    },
  };

  const result = savePage(repository, {
    body: '  注意力像带宽。  ',
    source: ' 课程 ',
    parentPageId: 9,
  });

  assert.deepEqual(result, { ok: true, page: samplePage });
  assert.deepEqual(calls, [
    {
      body: '注意力像带宽。',
      source: '课程',
      openingMessage: {
        text: '你写的“注意力像带宽”是指什么？能再具体说说吗？',
        requestId: 'opening',
      },
      parentPageId: 9,
    },
  ]);
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

  for (const parentPageId of [0, -1, 1.5, '1', null]) {
    assert.deepEqual(savePage(repository, { body: '有效正文', parentPageId }), {
      ok: false,
      errorCode: 'INVALID_PAGE_ID',
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
  assert.equal(savePage(repository, { body: '根页面' }).ok, true);
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

test('列出旧念头时应使用独立默认值和上限', () => {
  const calls = [];
  const repository = {
    listClosed(limit) {
      calls.push(limit);
      return [{ ...samplePage, status: 'closed' }];
    },
  };

  assert.deepEqual(listClosedPages(repository, undefined), {
    ok: true,
    pages: [{ ...samplePage, status: 'closed' }],
  });
  assert.deepEqual(listClosedPages(repository, { limit: 500 }), {
    ok: true,
    pages: [{ ...samplePage, status: 'closed' }],
  });
  assert.deepEqual(calls, [50, 100]);

  for (const payload of [null, [], { limit: 0 }, { limit: 1.5 }]) {
    assert.deepEqual(listClosedPages(repository, payload), {
      ok: false,
      errorCode: 'INVALID_LIST_LIMIT',
    });
  }
});

test('列出旧念头时应处理仓储异常', (t) => {
  t.mock.method(console, 'error', () => {});
  const repository = {
    listClosed() {
      throw new Error('数据库不可用');
    },
  };

  assert.deepEqual(listClosedPages(repository, { limit: 50 }), {
    ok: false,
    errorCode: 'LIST_FAILED',
  });
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

test('清空会话 IPC 应返回删除数量并处理仓储异常', (t) => {
  t.mock.method(console, 'error', () => {});

  assert.deepEqual(clearAllPages({ clearAll: () => 3 }), {
    ok: true,
    cleared: 3,
  });
  assert.deepEqual(
    clearAllPages({
      clearAll() {
        throw new Error('清空失败');
      },
    }),
    { ok: false, errorCode: 'SAVE_FAILED' },
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
    listClosed: () => [{ ...samplePage, status: 'closed' }],
    appendText: () => ({ ok: true, page: samplePage }),
    editText: () => ({ ok: true, page: samplePage }),
    closePage: () => ({ ok: true, page: { ...samplePage, status: 'closed' } }),
    clearAll: () => 1,
  };

  registerPageHandlers(ipcMain, repository);

  assert.deepEqual(
    new Set(handlers.keys()),
    new Set([
      ...Object.values(PAGE_CHANNELS),
      TITLE_CHANNELS.generate,
      TITLE_CHANNELS.update,
    ]),
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
    handlers.get(PAGE_CHANNELS.listClosed)(null, { limit: 50 }),
    {
      ok: true,
      pages: [{ ...samplePage, status: 'closed' }],
    },
  );
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
  assert.deepEqual(handlers.get(PAGE_CHANNELS.clearAll)(null), {
    ok: true,
    cleared: 1,
  });
});

test('保存、补写、编辑之后都应触发标题生成并广播', async () => {
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
    listClosed: () => [],
    appendText: () => ({ ok: true, page: samplePage }),
    editText: () => ({ ok: true, page: samplePage }),
    closePage: () => ({ ok: true, page: samplePage }),
    clearAll: () => 0,
  };
  const triggered = [];
  const titleService = {
    run(pageId, emit) {
      triggered.push(pageId);
      emit({ pageId, title: '注意力如何分配' });
      return Promise.resolve();
    },
  };
  const sent = [];
  const event = {
    sender: {
      isDestroyed: () => false,
      send: (channel, payload) => sent.push({ channel, payload }),
    },
  };

  registerPageHandlers(ipcMain, repository, undefined, titleService);

  handlers.get(PAGE_CHANNELS.save)(event, { body: '注意力像带宽。' });
  handlers.get(PAGE_CHANNELS.append)(event, {
    pageId: 1,
    content: '补一句。',
    requestId: 'append-1',
  });
  handlers.get(PAGE_CHANNELS.edit)(event, {
    pageId: 1,
    body: '改过的正文。',
    requestId: 'edit-1',
  });

  assert.deepEqual(triggered, [1, 1, 1]);
  assert.equal(sent.length, 3);

  for (const message of sent) {
    assert.deepEqual(message, {
      channel: TITLE_CHANNELS.updated,
      payload: { pageId: 1, title: '注意力如何分配' },
    });
  }
});

test('保存失败或窗口已销毁时不应触发标题生成', async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  let triggered = 0;
  const repository = {
    create: () => {
      throw new Error('db down');
    },
    findById: () => samplePage,
    listRecentReading: () => [],
    listClosed: () => [],
    appendText: () => ({ ok: false, reason: 'not_found' }),
    editText: () => ({ ok: false, reason: 'closed' }),
    closePage: () => ({ ok: true, page: samplePage }),
    clearAll: () => 0,
  };
  const titleService = {
    run() {
      triggered += 1;
      return Promise.resolve();
    },
  };

  registerPageHandlers(ipcMain, repository, undefined, titleService);

  assert.deepEqual(handlers.get(PAGE_CHANNELS.save)(null, { body: '笔记' }), {
    ok: false,
    errorCode: 'SAVE_FAILED',
  });
  assert.deepEqual(
    handlers.get(PAGE_CHANNELS.append)(null, {
      pageId: 1,
      content: '补一句。',
      requestId: 'append-2',
    }),
    { ok: false, errorCode: 'PAGE_NOT_FOUND' },
  );
  assert.deepEqual(
    handlers.get(PAGE_CHANNELS.edit)(null, {
      pageId: 1,
      body: '改过的正文。',
      requestId: 'edit-2',
    }),
    { ok: false, errorCode: 'PAGE_CLOSED' },
  );

  assert.equal(triggered, 0);
});

test('标题生成通道应校验参数并返回结果', async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const repository = {
    create: () => samplePage,
    findById: () => samplePage,
    listRecentReading: () => [],
    listClosed: () => [],
    appendText: () => ({ ok: true, page: samplePage }),
    editText: () => ({ ok: true, page: samplePage }),
    closePage: () => ({ ok: true, page: samplePage }),
    clearAll: () => 0,
  };
  const titleService = {
    run: () => Promise.resolve(),
    generate: async (pageId) => ({ ok: true, title: `标题-${pageId}` }),
  };

  registerPageHandlers(ipcMain, repository, undefined, titleService);

  assert.deepEqual(
    await handlers.get(TITLE_CHANNELS.generate)(null, { pageId: 2 }),
    {
      ok: true,
      title: '标题-2',
    },
  );
  assert.deepEqual(
    await handlers.get(TITLE_CHANNELS.generate)(null, { pageId: 0 }),
    {
      ok: false,
      errorCode: 'INVALID_PAGE_ID',
    },
  );
  assert.deepEqual(await handlers.get(TITLE_CHANNELS.generate)(null, null), {
    ok: false,
    errorCode: 'INVALID_PAGE_ID',
  });
  assert.deepEqual(
    await handlers.get(TITLE_CHANNELS.generate)(null, { pageId: 1.5 }),
    { ok: false, errorCode: 'INVALID_PAGE_ID' },
  );
});

test('没有标题服务时生成通道应返回受控错误', async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const repository = {
    create: () => samplePage,
    findById: () => samplePage,
    listRecentReading: () => [],
    listClosed: () => [],
    appendText: () => ({ ok: true, page: samplePage }),
    editText: () => ({ ok: true, page: samplePage }),
    closePage: () => ({ ok: true, page: samplePage }),
    clearAll: () => 0,
  };

  registerPageHandlers(ipcMain, repository);

  assert.deepEqual(
    await handlers.get(TITLE_CHANNELS.generate)(null, { pageId: 1 }),
    { ok: false, errorCode: 'CONFIG_FAILED' },
  );
});

test('标题生成抛出异常时应返回受控错误而不是让 invoke 拒绝', async (t) => {
  t.mock.method(console, 'error', () => {});
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const repository = {
    create: () => samplePage,
    findById: () => samplePage,
    listRecentReading: () => [],
    listClosed: () => [],
    appendText: () => ({ ok: true, page: samplePage }),
    editText: () => ({ ok: true, page: samplePage }),
    closePage: () => ({ ok: true, page: samplePage }),
    clearAll: () => 0,
  };
  const titleService = {
    run: () => Promise.resolve(),
    generate: () => Promise.reject(new Error('db down')),
  };

  registerPageHandlers(ipcMain, repository, undefined, titleService);

  assert.deepEqual(
    await handlers.get(TITLE_CHANNELS.generate)(null, { pageId: 1 }),
    { ok: false, errorCode: 'CONFIG_FAILED' },
  );
});

test('手动改标题应校验输入并标记为用户标题', async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const calls = [];
  const repository = {
    create: () => samplePage,
    findById: () => samplePage,
    listRecentReading: () => [],
    listClosed: () => [],
    appendText: () => ({ ok: true, page: samplePage }),
    editText: () => ({ ok: true, page: samplePage }),
    closePage: () => ({ ok: true, page: samplePage }),
    clearAll: () => 0,
    updateTitle(pageId, title, source) {
      calls.push({ pageId, title, source });
      return { ...samplePage, title: title.trim() };
    },
  };

  registerPageHandlers(ipcMain, repository);

  assert.deepEqual(
    await handlers.get(TITLE_CHANNELS.update)(null, {
      pageId: 1,
      title: '  注意力与分配  ',
    }),
    { ok: true, title: '注意力与分配' },
  );
  assert.deepEqual(calls, [
    { pageId: 1, title: '  注意力与分配  ', source: 'user' },
  ]);

  for (const payload of [
    null,
    {},
    { pageId: 0, title: '标题' },
    { pageId: 1.5, title: '标题' },
    { pageId: 1, title: '   ' },
    { pageId: 1, title: 42 },
  ]) {
    const result = await handlers.get(TITLE_CHANNELS.update)(null, payload);
    assert.equal(result.ok, false);
    assert.ok(
      result.errorCode === 'INVALID_PAGE_ID' ||
        result.errorCode === 'INVALID_BODY',
    );
  }
});

test('手动改标题应在页面不存在或写入异常时返回受控错误', async (t) => {
  t.mock.method(console, 'error', () => {});
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const repository = {
    create: () => samplePage,
    findById: () => samplePage,
    listRecentReading: () => [],
    listClosed: () => [],
    appendText: () => ({ ok: true, page: samplePage }),
    editText: () => ({ ok: true, page: samplePage }),
    closePage: () => ({ ok: true, page: samplePage }),
    clearAll: () => 0,
    updateTitle: () => null,
  };

  registerPageHandlers(ipcMain, repository);
  assert.deepEqual(
    await handlers.get(TITLE_CHANNELS.update)(null, {
      pageId: 9,
      title: '标题',
    }),
    { ok: false, errorCode: 'PAGE_NOT_FOUND' },
  );

  repository.updateTitle = () => {
    throw new Error('db down');
  };
  assert.deepEqual(
    await handlers.get(TITLE_CHANNELS.update)(null, {
      pageId: 1,
      title: '标题',
    }),
    { ok: false, errorCode: 'SAVE_FAILED' },
  );
});
