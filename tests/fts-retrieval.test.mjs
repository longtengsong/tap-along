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
import { PagesRepository, escapeLikeTerm } from '../src/main/db/pages.ts';

const createRepository = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-fts-'));
  const db = openDatabase(allocateDatabasePath(directory));
  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });
  return { db, repository: new PagesRepository(db) };
};

const matchIds = (db, term) =>
  db
    .prepare(
      'SELECT rowid FROM pages_fts WHERE pages_fts MATCH ? ORDER BY rowid',
    )
    .all(`"${term}"`)
    .map((row) => row.rowid);

test('LIKE 转义应处理反斜杠、百分号和下划线', () => {
  assert.equal(escapeLikeTerm('50%_\\'), '50\\%\\_\\\\');
});

test('FTS 应召回较早但共享中文关键词的页并排除当前页', async (t) => {
  const { repository } = await createRepository(t);
  const current = repository.create('今天天气不错。', '日记');
  const related = repository.create('注意力是一种有限资源。', '课程');
  const alsoRelated = repository.create('注意力需要主动分配。', '课程');

  const pages = repository.searchPagesForRetrieval(current.id, ['注意力'], 10);
  const ids = pages.map((page) => page.id);

  assert.equal(ids.includes(current.id), false);
  assert.equal(ids.includes(related.id), true);
  assert.equal(ids.includes(alsoRelated.id), true);
});

test('FTS 应支持英文单词并保持最近页补足', async (t) => {
  const { repository } = await createRepository(t);
  const current = repository.create('A note about weather.', 'diary');
  const related = repository.create(
    'Attention is a limited resource.',
    'course',
  );
  repository.create('Unrelated page one.', 'diary');
  repository.create('Unrelated page two.', 'diary');

  const pages = repository.searchPagesForRetrieval(
    current.id,
    ['attention'],
    10,
  );

  assert.equal(pages[0].id, related.id);
  assert.ok(pages.length >= 3);
});

test('2 字词、空词项和非法参数应回退最近页或返回空', async (t) => {
  const { repository } = await createRepository(t);
  const current = repository.create('当前页。', '日记');
  const related = repository.create('注意力需要分配。', '课程');

  const short = repository.searchPagesForRetrieval(current.id, ['注意'], 10);
  assert.equal(
    short.some((page) => page.id === related.id),
    true,
  );
  assert.deepEqual(
    repository.searchPagesForRetrieval(current.id, [], 10),
    short,
  );
  assert.deepEqual(repository.searchPagesForRetrieval(0, ['注意力'], 10), []);
  assert.deepEqual(
    repository.searchPagesForRetrieval(current.id, ['注意力'], 0),
    [],
  );
  assert.deepEqual(
    repository.searchPagesForRetrieval(current.id, null, 10).length,
    short.length,
  );
});

test('特殊字符不应造成 FTS 语法错误', async (t) => {
  const { repository } = await createRepository(t);
  const current = repository.create('当前页。', '日记');
  repository.create('包含特殊字符 a"b 的页。', '课程');

  assert.doesNotThrow(() =>
    repository.searchPagesForRetrieval(current.id, ['a"b', '*', 'OR'], 10),
  );
});

test('编辑和补一句后索引应与正文一致', async (t) => {
  const { db, repository } = await createRepository(t);
  const page = repository.create('独特词有限资源在这里。', '课程');

  assert.deepEqual(matchIds(db, '有限资源'), [page.id]);

  repository.editText(page.id, '完全不同的新词条。', 'edit-1');
  assert.deepEqual(matchIds(db, '有限资源'), []);
  assert.deepEqual(matchIds(db, '新词条'), [page.id]);

  repository.appendText(page.id, '追加的独特标记。', 'append-1');
  assert.equal(
    repository.findById(page.id).body.includes('追加的独特标记'),
    true,
  );
  assert.deepEqual(matchIds(db, '追加的独特标记'), [page.id]);
});

test('清空全部会话应同时清空 FTS 索引', async (t) => {
  const { db, repository } = await createRepository(t);
  repository.create('注意力是一种有限资源。', '课程');
  repository.create('另一页。', '课程');

  const pageCount = db
    .prepare('SELECT COUNT(*) AS count FROM pages')
    .get().count;
  const ftsCount = db
    .prepare('SELECT COUNT(*) AS count FROM pages_fts')
    .get().count;

  assert.equal(Number(pageCount), Number(ftsCount));

  assert.equal(repository.clearAll(), 2);
  assert.equal(
    Number(db.prepare('SELECT COUNT(*) AS count FROM pages').get().count),
    0,
  );
  assert.equal(
    Number(db.prepare('SELECT COUNT(*) AS count FROM pages_fts').get().count),
    0,
  );
});

test('2 字中文词应能召回最近 100 条之外的旧页', async (t) => {
  const { repository } = await createRepository(t);
  const target = repository.create('注意需要主动分配。', '课程');

  for (let index = 0; index < 99; index += 1) {
    repository.create(`无关页 ${index}。`, '日记');
  }

  const current = repository.create('注意。', '课程');
  const pages = repository.searchPagesForRetrieval(current.id, ['注意'], 100);

  assert.equal(
    pages.some((page) => page.id === target.id),
    true,
  );
});
