import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  allocateDatabasePath,
  closeDatabase,
  openDatabase,
} from '../src/main/db/client.ts';
import { PagesRepository } from '../src/main/db/pages.ts';
import { parseGuidanceView } from '../src/shared/guidance.ts';

const hash = (body) => createHash('sha256').update(body).digest('hex');

const opening = {
  text: '你写的“注意力”是指什么？',
  requestId: 'opening',
};

const createRepository = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-guidance-'));
  const db = openDatabase(allocateDatabasePath(directory));
  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });
  return { db, repository: new PagesRepository(db) };
};

const guidance = (body, overrides = {}) => ({
  status: 'needed',
  suggestions: [
    {
      id: 'g-2',
      relatedPageIds: [2],
      notes: [{ pageId: 2, title: '注意力与任务', source: '课程' }],
      why: '两页都在讨论注意力如何分配。',
      question: '你说注意力有限，那有限的是总量还是分配？',
    },
  ],
  bodyHash: hash(body),
  updatedAt: 1,
  ...overrides,
});

test('应持久化引导并在成功时移除开场问题', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程', opening);
  const view = guidance(page.body);

  const saved = repository.finalizeGuidance(page.id, view, {
    removeOpening: true,
    expectedBody: page.body,
  });

  assert.ok(saved);
  assert.deepEqual(saved.guidance, view);
  assert.deepEqual(saved.messages, []);
  assert.equal(repository.findById(page.id).guidance.status, 'needed');
});

test('应持久化并读回引导卡片的锚点句', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程', opening);
  const view = guidance(page.body, {
    suggestions: [
      {
        id: 'g-2',
        relatedPageIds: [2],
        notes: [{ pageId: 2, title: '注意力与任务', source: '课程' }],
        why: '两条念头都在讨论注意力如何分配。',
        question: '你说注意力有限，那有限的是总量还是分配？',
        anchorQuote: '注意力是有限资源',
      },
    ],
  });

  const saved = repository.finalizeGuidance(page.id, view, {
    removeOpening: true,
    expectedBody: page.body,
  });

  assert.ok(saved);
  assert.equal(saved.guidance.suggestions[0].anchorQuote, '注意力是有限资源');
  assert.equal(
    repository.findById(page.id).guidance.suggestions[0].anchorQuote,
    '注意力是有限资源',
  );
});

test('多个旧念头应一起持久化并可读回', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程', opening);
  const view = guidance(page.body, {
    suggestions: [
      {
        id: 'g-2-3',
        relatedPageIds: [2, 3],
        notes: [
          { pageId: 2, title: '注意力与任务', source: '课程' },
          { pageId: 3, title: '任务牵引', source: '日记' },
        ],
        why: '两页分别讲了分配和牵引，当前页讲有限。',
        question:
          '你写过注意力需要主动分配，也写过任务会牵引它，那这页说的“有限”到底卡在哪？',
      },
    ],
  });

  const saved = repository.finalizeGuidance(page.id, view, {
    removeOpening: true,
    expectedBody: page.body,
  });
  const reloaded = repository.findById(page.id);

  assert.ok(saved);
  assert.deepEqual(reloaded.guidance.suggestions[0].relatedPageIds, [2, 3]);
  assert.deepEqual(reloaded.guidance.suggestions[0].notes, [
    { pageId: 2, title: '注意力与任务', source: '课程' },
    { pageId: 3, title: '任务牵引', source: '日记' },
  ]);
});

test('旧版单页引导数据应能读回为一条接点', () => {
  const parsed = parseGuidanceView(
    JSON.stringify({
      status: 'needed',
      suggestions: [
        {
          id: 'g-2',
          relatedPageId: 2,
          title: '注意力与任务',
          source: '课程',
          why: '两页都在讨论注意力如何分配。',
          question: '你说注意力有限，那有限的是总量还是分配？',
        },
      ],
      bodyHash: 'hash',
      updatedAt: 1,
    }),
  );

  assert.ok(parsed);
  assert.deepEqual(parsed.suggestions[0].relatedPageIds, [2]);
  assert.deepEqual(parsed.suggestions[0].notes, [
    { pageId: 2, title: '注意力与任务', source: '课程' },
  ]);
  assert.equal(parsed.suggestions[0].why, '两页都在讨论注意力如何分配。');
});

test('失败或没有候选时应保留开场问题', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程', opening);
  const view = guidance(page.body, {
    status: 'failed',
    suggestions: [],
  });

  const saved = repository.finalizeGuidance(page.id, view, {
    removeOpening: false,
    expectedBody: page.body,
  });

  assert.ok(saved);
  assert.equal(saved.messages.length, 1);
  assert.equal(saved.messages[0].requestId, 'opening');
  assert.equal(saved.guidance.status, 'failed');
});

test('页面已有用户消息、正文变化、已关闭或编号无效时应拒绝写入', async (t) => {
  const { repository } = await createRepository(t);

  const withUser = repository.create('已有用户消息。', '课程', opening);
  repository.beginTeacherTurn(withUser.id, '我的想法。', 'user-1');
  assert.equal(
    repository.finalizeGuidance(withUser.id, guidance(withUser.body), {
      removeOpening: true,
      expectedBody: withUser.body,
    }),
    null,
  );

  const changed = repository.create('原正文。', '课程', opening);
  assert.equal(
    repository.finalizeGuidance(changed.id, guidance(changed.body), {
      removeOpening: true,
      expectedBody: '不同的正文。',
    }),
    null,
  );

  const closed = repository.create('已合上的页。', '课程', opening);
  repository.closePage(closed.id, 'close-1');
  assert.equal(
    repository.finalizeGuidance(closed.id, guidance(closed.body), {
      removeOpening: true,
      expectedBody: closed.body,
    }),
    null,
  );

  assert.equal(
    repository.finalizeGuidance(0, guidance('正文'), {
      removeOpening: false,
      expectedBody: '正文',
    }),
    null,
  );
});

test('点击接点应追加一个问题、标记已用并保持幂等', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程', opening);
  const view = guidance(page.body);
  repository.finalizeGuidance(page.id, view, {
    removeOpening: true,
    expectedBody: page.body,
  });

  const first = repository.useGuidanceSuggestion(page.id, 'g-2');
  assert.equal(first.ok, true);
  assert.equal(first.question, view.suggestions[0].question);
  assert.equal(first.guidance.suggestions[0].used, true);

  const saved = repository.findById(page.id);
  assert.equal(saved.messages.length, 1);
  assert.equal(saved.messages[0].role, 'teacher');
  assert.equal(saved.messages[0].text, view.suggestions[0].question);
  assert.equal(saved.messages[0].requestId, 'guidance-g-2');
  assert.equal(saved.guidance.suggestions[0].used, true);

  const second = repository.useGuidanceSuggestion(page.id, 'g-2');
  assert.equal(second.ok, true);
  assert.equal(repository.findById(page.id).messages.length, 1);
});

test('点击接点应拒绝未知接点、过期正文、已关闭和不存在的页面', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程', opening);
  repository.finalizeGuidance(page.id, guidance(page.body), {
    removeOpening: true,
    expectedBody: page.body,
  });

  assert.deepEqual(repository.useGuidanceSuggestion(page.id, 'missing'), {
    ok: false,
    errorCode: 'TEACHER_INVALID_REQUEST',
  });
  assert.deepEqual(repository.useGuidanceSuggestion(0, 'g-2'), {
    ok: false,
    errorCode: 'TEACHER_INVALID_REQUEST',
  });
  assert.deepEqual(repository.useGuidanceSuggestion(999, 'g-2'), {
    ok: false,
    errorCode: 'PAGE_NOT_FOUND',
  });

  repository.editText(page.id, '改过的正文。', 'edit-1');
  assert.deepEqual(repository.useGuidanceSuggestion(page.id, 'g-2'), {
    ok: false,
    errorCode: 'TEACHER_INVALID_REQUEST',
  });

  const stale = repository.create('过期正文。', '课程', opening);
  repository.finalizeGuidance(
    stale.id,
    guidance(stale.body, { bodyHash: 'wrong' }),
    { removeOpening: true, expectedBody: stale.body },
  );
  assert.deepEqual(repository.useGuidanceSuggestion(stale.id, 'g-2'), {
    ok: false,
    errorCode: 'TEACHER_INVALID_REQUEST',
  });

  const closed = repository.create('已关闭。', '课程', opening);
  repository.finalizeGuidance(closed.id, guidance(closed.body), {
    removeOpening: true,
    expectedBody: closed.body,
  });
  repository.closePage(closed.id, 'close-2');
  assert.deepEqual(repository.useGuidanceSuggestion(closed.id, 'g-2'), {
    ok: false,
    errorCode: 'PAGE_CLOSED',
  });
});

test('编辑或补一句应清空旧引导并移除隐藏的开场问题', async (t) => {
  const { repository } = await createRepository(t);
  const edited = repository.create('注意力是有限资源。', '课程', opening);
  repository.finalizeGuidance(
    edited.id,
    guidance(edited.body, {
      status: 'failed',
      suggestions: [],
    }),
    { removeOpening: false, expectedBody: edited.body },
  );

  const editedPage = repository.editText(edited.id, '修改后的正文。', 'edit-2');
  assert.equal(editedPage.ok, true);
  assert.equal(editedPage.page.guidance, undefined);
  assert.equal(
    editedPage.page.messages.some((message) => message.requestId === 'opening'),
    false,
  );

  const appended = repository.create('注意力是有限资源。', '课程', opening);
  repository.finalizeGuidance(
    appended.id,
    guidance(appended.body, {
      status: 'failed',
      suggestions: [],
    }),
    { removeOpening: false, expectedBody: appended.body },
  );

  const appendedPage = repository.appendText(
    appended.id,
    '补一句。',
    'append-2',
  );
  assert.equal(appendedPage.ok, true);
  assert.equal(appendedPage.page.guidance, undefined);
  assert.equal(
    appendedPage.page.messages.some(
      (message) => message.requestId === 'opening',
    ),
    false,
  );

  const plain = repository.create('没有引导的旧页。', '课程', opening);
  const plainPage = repository.editText(plain.id, '改一下。', 'edit-3');
  assert.equal(
    plainPage.page.messages.some((message) => message.requestId === 'opening'),
    true,
  );
});

test('检索列表应排除当前页、按最近排序并返回标题和出处', async (t) => {
  const { repository } = await createRepository(t);
  const first = repository.create('第一页。', '课程');
  const second = repository.create('第二页。', '网页');
  const third = repository.create('第三页。', '');

  const pages = repository.listRecentPagesForRetrieval(first.id, 10);
  assert.deepEqual(
    pages.map((page) => page.id),
    [third.id, second.id],
  );
  assert.equal(pages[0].title, '第三页。');
  assert.equal(pages[0].source, '');
  assert.equal(pages[1].source, '网页');
  assert.equal(typeof pages[0].updatedAt, 'string');

  assert.deepEqual(repository.listRecentPagesForRetrieval(0, 10), []);
  assert.deepEqual(repository.listRecentPagesForRetrieval(first.id, 0), []);
});

test('损坏的 guidance JSON 应被当作没有引导', async (t) => {
  const { db, repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程', opening);

  db.prepare('UPDATE pages SET guidance = ? WHERE id = ?').run(
    '{not-json',
    page.id,
  );
  assert.equal(repository.findById(page.id).guidance, undefined);

  db.prepare('UPDATE pages SET guidance = ? WHERE id = ?').run(
    JSON.stringify({ status: 'unknown', suggestions: [] }),
    page.id,
  );
  assert.equal(repository.findById(page.id).guidance, undefined);
});

test('删除页面后引导随之消失', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程', opening);
  repository.finalizeGuidance(page.id, guidance(page.body), {
    removeOpening: true,
    expectedBody: page.body,
  });

  assert.equal(repository.clearAll(), 1);
  assert.equal(repository.findById(page.id), null);
});

test('刷新模式可允许用户消息但消息数必须一致', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程', opening);
  repository.beginTeacherTurn(page.id, '我先写一句。', 'user-1');
  const view = guidance(page.body);

  const mismatch = repository.finalizeGuidance(page.id, view, {
    removeOpening: false,
    expectedBody: page.body,
    allowUserMessages: true,
    expectedMessageCount: 1,
  });
  assert.equal(mismatch, null);

  const saved = repository.finalizeGuidance(page.id, view, {
    removeOpening: false,
    expectedBody: page.body,
    allowUserMessages: true,
    expectedMessageCount: 2,
  });
  assert.ok(saved);
  assert.equal(saved.guidance.status, 'needed');
  assert.equal(
    saved.messages.some((message) => message.requestId === 'opening'),
    true,
  );
});
