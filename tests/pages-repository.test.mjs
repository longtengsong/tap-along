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
