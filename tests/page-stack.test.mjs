import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_PAGE_STACK_DEPTH,
  collectReadingStack,
} from '../src/shared/page-stack.ts';

const page = (id, parentPageId = null, status = 'reading') => ({
  id,
  parentPageId,
  status,
});

test('应按父链还原根页到最新页的页叠', async () => {
  const pages = new Map([
    [1, page(1)],
    [2, page(2, 1)],
    [3, page(3, 2)],
  ]);

  const stack = await collectReadingStack(
    pages.get(3),
    async (pageId) => pages.get(pageId) ?? null,
  );

  assert.deepEqual(
    stack.map((item) => item.id),
    [1, 2, 3],
  );
});

test('最外层新建页应单独成叠且不读取父页', async () => {
  const stack = await collectReadingStack(page(9), async () => {
    throw new Error('不应读取父页');
  });

  assert.deepEqual(
    stack.map((item) => item.id),
    [9],
  );
});

test('父页已合上时应在父页处截断', async () => {
  const pages = new Map([
    [1, page(1, null, 'closed')],
    [2, page(2, 1)],
  ]);

  const stack = await collectReadingStack(
    pages.get(2),
    async (pageId) => pages.get(pageId) ?? null,
  );

  assert.deepEqual(
    stack.map((item) => item.id),
    [2],
  );
});

test('父页读取失败时应保留最新页', async () => {
  const stack = await collectReadingStack(page(2, 1), async () => {
    throw new Error('数据库错误');
  });

  assert.deepEqual(
    stack.map((item) => item.id),
    [2],
  );
});

test('父页不存在时应保留最新页', async () => {
  const stack = await collectReadingStack(page(2, 1), async () => null);

  assert.deepEqual(
    stack.map((item) => item.id),
    [2],
  );
});

test('父链成环时应停止且不重复入栈', async () => {
  const pages = new Map([
    [1, page(1, 2)],
    [2, page(2, 1)],
  ]);

  const stack = await collectReadingStack(
    pages.get(2),
    async (pageId) => pages.get(pageId) ?? null,
  );

  assert.deepEqual(
    stack.map((item) => item.id),
    [1, 2],
  );
});

test('超过深度上限时应只保留上限内的页', async () => {
  const pages = new Map();
  for (let id = 1; id <= 5; id += 1) {
    pages.set(id, page(id, id === 1 ? null : id - 1));
  }

  const stack = await collectReadingStack(
    pages.get(5),
    async (pageId) => pages.get(pageId) ?? null,
    3,
  );

  assert.deepEqual(
    stack.map((item) => item.id),
    [3, 4, 5],
  );
  assert.equal(MAX_PAGE_STACK_DEPTH, 20);
});
