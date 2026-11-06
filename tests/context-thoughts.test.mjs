import assert from 'node:assert/strict';
import test from 'node:test';
import { listContextThoughts } from '../src/main/services/context-thoughts.ts';

const page = (id, overrides = {}) => ({
  id,
  parentPageId: null,
  title: `念头 ${id}`,
  body: `正文 ${id}`,
  source: `出处 ${id}`,
  status: 'reading',
  parseStatus: 'done',
  teachingRoundCount: 0,
  messages: [],
  ...overrides,
});

const guidance = (notes) => ({
  status: 'needed',
  suggestions: [
    {
      id: 'g-1',
      relatedPageIds: notes.map((note) => note.pageId),
      notes,
      why: '因为',
      question: '为什么？',
    },
  ],
  bodyHash: 'hash',
  updatedAt: 1,
});

const repository = (pages, branches = []) => ({
  findById: (pageId) => pages.get(pageId) ?? null,
  listClosedDescendantBodies: () => branches,
});

test('上下文念头先列接上的旧念头，再列另记的念头', () => {
  const pages = new Map([
    [1, page(1)],
    [
      2,
      page(2, {
        title: '旧念头二',
        body: '旧念头二的全文',
        source: '旧出处二',
      }),
    ],
    [
      3,
      page(3, {
        title: '旧念头三',
        body: '旧念头三的全文',
        source: '旧出处三',
      }),
    ],
    [
      8,
      page(8, { title: '另记八', body: '另记八的全文', source: '另记出处八' }),
    ],
    [
      5,
      page(5, { title: '另记五', body: '另记五的全文', source: '另记出处五' }),
    ],
  ]);
  pages.get(1).guidance = guidance([
    {
      pageId: 2,
      title: '旧念头二（候选标题）',
      source: '旧出处二',
      excerpt: '1200 字摘录',
    },
    { pageId: 3, title: '旧念头三', source: '旧出处三', excerpt: '摘录三' },
  ]);

  const result = listContextThoughts(
    repository(pages, [
      { pageId: 8, body: '被压缩的八', depth: 1, rootPageId: 8 },
      { pageId: 5, body: '被压缩的五', depth: 1, rootPageId: 5 },
    ]),
    1,
  );

  assert.deepEqual(result, [
    {
      pageId: 2,
      title: '旧念头二',
      source: '旧出处二',
      body: '旧念头二的全文',
      kind: 'line',
    },
    {
      pageId: 3,
      title: '旧念头三',
      source: '旧出处三',
      body: '旧念头三的全文',
      kind: 'line',
    },
    {
      pageId: 5,
      title: '另记五',
      source: '另记出处五',
      body: '另记五的全文',
      kind: 'branch',
    },
    {
      pageId: 8,
      title: '另记八',
      source: '另记出处八',
      body: '另记八的全文',
      kind: 'branch',
    },
  ]);
});

test('旧念头页读不到时退回 guidance 里的标题和摘录', () => {
  const pages = new Map([[1, page(1)]]);
  pages.get(1).guidance = guidance([
    {
      pageId: 99,
      title: '只剩标题',
      source: '只剩出处',
      excerpt: '只剩摘录',
    },
  ]);

  assert.deepEqual(listContextThoughts(repository(pages), 1), [
    {
      pageId: 99,
      title: '只剩标题',
      source: '只剩出处',
      body: '只剩摘录',
      kind: 'line',
    },
  ]);
});

test('同一页既在接线上又另记过时只保留接线上的那条', () => {
  const pages = new Map([
    [1, page(1)],
    [2, page(2, { title: '接上的二', body: '接线正文' })],
  ]);
  pages.get(1).guidance = guidance([
    { pageId: 2, title: '接上的二', source: '', excerpt: '摘录' },
  ]);

  const result = listContextThoughts(
    repository(pages, [
      { pageId: 2, body: '另记正文', depth: 1, rootPageId: 2 },
    ]),
    1,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'line');
  assert.equal(result[0].body, '接线正文');
});

test('当前页已合上或编号无效时返回空清单', () => {
  const pages = new Map([[1, page(1, { status: 'closed' })]]);

  assert.deepEqual(listContextThoughts(repository(pages), 1), []);
  assert.deepEqual(listContextThoughts(repository(pages), 0), []);
  assert.deepEqual(listContextThoughts(repository(pages), 1.5), []);
});

test('没有标题的另记页仍可出现在清单里', () => {
  const pages = new Map([
    [1, page(1)],
    [2, page(2, { title: '', body: '没有标题的正文', source: '' })],
  ]);

  assert.deepEqual(
    listContextThoughts(
      repository(pages, [
        { pageId: 2, body: '没有标题的正文', depth: 1, rootPageId: 2 },
      ]),
      1,
    ),
    [
      {
        pageId: 2,
        title: '',
        source: '',
        body: '没有标题的正文',
        kind: 'branch',
      },
    ],
  );
});
