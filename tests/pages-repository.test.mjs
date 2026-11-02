import assert from 'node:assert/strict';
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

const createRepository = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-pages-'));
  const db = openDatabase(allocateDatabasePath(directory));

  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });

  return { db, repository: new PagesRepository(db) };
};

test('页边仓储应创建并读回完整数据', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力像带宽。\n分配决定处理能力。', '课程');

  assert.equal(typeof page.id, 'number', '页边编号应为数字');
  assert.equal(page.title, '注意力像带宽。', '应使用正文首行作为临时题眼');
  assert.equal(page.body, '注意力像带宽。\n分配决定处理能力。');
  assert.equal(page.source, '课程');
  assert.equal(page.status, 'reading');
  assert.equal(page.parseStatus, 'pending');
  assert.equal(page.teachingRoundCount, 0);
  assert.deepEqual(page.messages, []);

  const savedPage = repository.findById(page.id);
  assert.deepEqual(savedPage, page, '按编号读取的内容应与创建结果一致');
});

test('页边仓储应处理空出处和无效编号', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('一行笔记', '');

  assert.equal(page.source, '', '空出处应归一化为空字符串');
  assert.equal(repository.findById(0), null, '零不是有效页边编号');
  assert.equal(repository.findById(-1), null, '负数不是有效页边编号');
  assert.equal(repository.findById(1.5), null, '小数不是有效页边编号');
  assert.equal(repository.findById(999_999), null, '不存在时应返回空值');
});

test('页边仓储应恢复合法对谈记录', async (t) => {
  const { db, repository } = await createRepository(t);
  const page = repository.create('有对谈的页边', '网页');

  db.prepare(
    `UPDATE pages
     SET edge_title = ?, parse_status = ?, page_status = ?, companion_log = ?
     WHERE id = ?`,
  ).run(
    '更明确的题眼',
    'done',
    'closed',
    JSON.stringify([
      { role: 'teacher', text: '你怎么理解？' },
      { role: 'user', text: '我的理解。' },
      {
        role: 'maintenance',
        text: '补了一句',
        suggest_close: true,
      },
    ]),
    page.id,
  );

  const savedPage = repository.findById(page.id);
  assert.equal(savedPage.title, '更明确的题眼');
  assert.equal(savedPage.status, 'closed');
  assert.equal(savedPage.parseStatus, 'done');
  assert.equal(savedPage.messages.length, 3);
  assert.deepEqual(savedPage.messages[0], {
    role: 'teacher',
    text: '你怎么理解？',
  });
  assert.equal(savedPage.messages[2].suggestClose, true);
});

test('页边仓储应容错异常数据库内容和状态', async (t) => {
  const { db, repository } = await createRepository(t);
  const page = repository.create('回退题眼内容', '书');

  db.prepare(
    `UPDATE pages
     SET edge_title = ?, parse_status = ?, page_status = ?, companion_log = ?
     WHERE id = ?`,
  ).run(
    '   ',
    'unknown',
    'unknown',
    JSON.stringify([
      null,
      { role: 'unknown', text: '忽略' },
      { role: 'teacher', text: 123 },
    ]),
    page.id,
  );

  const savedPage = repository.findById(page.id);
  assert.equal(savedPage.title, '回退题眼内容');
  assert.equal(savedPage.status, 'reading');
  assert.equal(savedPage.parseStatus, 'pending');
  assert.deepEqual(savedPage.messages, []);

  db.prepare('UPDATE pages SET companion_log = ? WHERE id = ?').run(
    '{损坏的记录',
    page.id,
  );
  assert.deepEqual(repository.findById(page.id).messages, []);

  db.prepare('UPDATE pages SET companion_log = ? WHERE id = ?').run(
    '{"role":"teacher"}',
    page.id,
  );
  assert.deepEqual(repository.findById(page.id).messages, []);
});

test('页边仓储应持久化老师问答并按请求编号去重', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('持久化问答', '课程');

  const withUser = repository.beginTeacherTurn(
    page.id,
    '我的回答。',
    'request-1',
  );
  assert.equal(withUser.messages.length, 1);
  assert.deepEqual(withUser.messages[0], {
    role: 'user',
    text: '我的回答。',
    requestId: 'request-1',
    createdAt: withUser.messages[0].createdAt,
  });

  const duplicateUser = repository.beginTeacherTurn(
    page.id,
    '我的回答。',
    'request-1',
  );
  assert.equal(duplicateUser.messages.length, 1);

  const completed = repository.completeTeacherTurn(
    page.id,
    '你怎么得出这个判断？',
    false,
    'request-1',
  );
  assert.equal(completed.messages.length, 2);
  assert.equal(completed.messages[1].role, 'teacher');
  assert.equal(completed.messages[1].requestId, 'request-1');
  assert.equal(completed.teachingRoundCount, 1);

  const duplicateTeacher = repository.completeTeacherTurn(
    page.id,
    '不该重复写入',
    false,
    'request-1',
  );
  assert.equal(duplicateTeacher.messages.length, 2);
  assert.equal(duplicateTeacher.teachingRoundCount, 1);
});

test('最近在读页应按更新时间和编号排序并排除已合上页', async (t) => {
  const { db, repository } = await createRepository(t);
  const firstPage = repository.create('第一页', '');
  const secondPage = repository.create('第二页', '');
  const closedPage = repository.create('已合上页', '');

  db.prepare(
    `UPDATE pages
     SET updated_at = '2030-01-01 00:00:00'
     WHERE id = ?`,
  ).run(firstPage.id);
  db.prepare(
    `UPDATE pages
     SET page_status = 'closed', updated_at = '2031-01-01 00:00:00'
     WHERE id = ?`,
  ).run(closedPage.id);

  assert.deepEqual(
    repository.listRecentReading(1).map((page) => page.id),
    [firstPage.id],
  );
  assert.deepEqual(
    repository.listRecentReading(5).map((page) => page.id),
    [firstPage.id, secondPage.id],
  );
});

test('补一句应在事务中更新正文并写入结构化维护记录', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('原始笔记。', '课程');
  const result = repository.appendText(page.id, '补入的新想法。', 'append-1');

  assert.equal(result.ok, true);
  assert.equal(result.page.title, page.title, '补一句不应修改题眼');
  assert.equal(result.page.body, '原始笔记。\n\n补入的新想法。');
  assert.equal(result.page.messages.length, 1);
  assert.equal(result.page.messages[0].role, 'maintenance');
  assert.equal(result.page.messages[0].actionType, 'appended_note');
  assert.equal(result.page.messages[0].content, '补入的新想法。');
  assert.equal(result.page.messages[0].requestId, 'append-1');

  const duplicate = repository.appendText(
    page.id,
    '不应重复追加。',
    'append-1',
  );
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.page.body, '原始笔记。\n\n补入的新想法。');
  assert.equal(duplicate.page.messages.length, 1);
});

test('补一句应拒绝不存在的页边和已合上页', async (t) => {
  const { db, repository } = await createRepository(t);
  const page = repository.create('准备合上的页边。', '');

  assert.deepEqual(repository.appendText(999_999, '内容', 'append-missing'), {
    ok: false,
    reason: 'not_found',
  });

  db.prepare("UPDATE pages SET page_status = 'closed' WHERE id = ?").run(
    page.id,
  );
  assert.deepEqual(repository.appendText(page.id, '内容', 'append-closed'), {
    ok: false,
    reason: 'closed',
  });
});

test('改批注应更新正文、重置题眼并写入结构化维护记录', async (t) => {
  const { db, repository } = await createRepository(t);
  const page = repository.create('原始笔记。', '课程');
  db.prepare(
    `UPDATE pages
     SET edge_title = '原题眼', parse_status = 'done'
     WHERE id = ?`,
  ).run(page.id);

  const result = repository.editText(page.id, '修改后的正文。', 'edit-1');
  assert.equal(result.ok, true);
  assert.equal(result.page.body, '修改后的正文。');
  assert.equal(result.page.title, '修改后的正文。');
  assert.equal(result.page.parseStatus, 'pending');
  assert.equal(result.page.messages.length, 1);
  assert.equal(result.page.messages[0].actionType, 'edited_note');
  assert.equal(result.page.messages[0].requestId, 'edit-1');

  const stored = db
    .prepare('SELECT edge_title, parse_status FROM pages WHERE id = ?')
    .get(page.id);
  assert.equal(stored.edge_title, null);
  assert.equal(stored.parse_status, 'pending');

  const duplicate = repository.editText(page.id, '不应覆盖正文。', 'edit-1');
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.page.body, '修改后的正文。');
  assert.equal(duplicate.page.messages.length, 1);
});

test('改批注应拒绝不存在的页边和已合上页', async (t) => {
  const { db, repository } = await createRepository(t);
  const page = repository.create('准备合上的页边。', '');

  assert.deepEqual(repository.editText(999_999, '内容', 'edit-missing'), {
    ok: false,
    reason: 'not_found',
  });

  db.prepare("UPDATE pages SET page_status = 'closed' WHERE id = ?").run(
    page.id,
  );
  assert.deepEqual(repository.editText(page.id, '内容', 'edit-closed'), {
    ok: false,
    reason: 'closed',
  });
});

test('合上页面应更新状态并写入结构化结束记录', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('准备合上的正文。', '课程');
  const result = repository.closePage(page.id, 'close-1');

  assert.equal(result.ok, true);
  assert.equal(result.page.status, 'closed');
  assert.equal(result.page.body, page.body);
  assert.equal(result.page.teachingRoundCount, 0);
  assert.equal(result.page.messages.length, 1);
  assert.equal(result.page.messages[0].role, 'teacher');
  assert.equal(result.page.messages[0].actionType, 'end');
  assert.equal(result.page.messages[0].requestId, 'close-1');

  const duplicate = repository.closePage(page.id, 'close-1');
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.page.status, 'closed');
  assert.equal(duplicate.page.messages.length, 1);
});

test('合上页面应拒绝不存在的页边并保持幂等', async (t) => {
  const { repository } = await createRepository(t);

  assert.deepEqual(repository.closePage(999_999, 'close-missing'), {
    ok: false,
    reason: 'not_found',
  });

  const page = repository.create('已合上页。', '');
  repository.closePage(page.id, 'close-first');
  const repeated = repository.closePage(page.id, 'close-second');
  assert.equal(repeated.ok, true);
  assert.equal(repeated.page.messages.length, 1);
});
