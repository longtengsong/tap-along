import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  DATABASE_FILENAME,
  allocateDatabasePath,
  closeDatabase,
  openDatabase,
} from '../src/main/db/client.ts';

const createDatabasePath = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return allocateDatabasePath(directory);
};

test('数据库文件名应使用 tap-along 连字符格式', () => {
  assert.equal(DATABASE_FILENAME, 'tap-along.db');
});

test('初始化数据库时应启用 WAL、页边表及索引', async (t) => {
  const db = openDatabase(await createDatabasePath(t));
  t.after(() => closeDatabase(db));

  const journalMode = db.prepare('PRAGMA journal_mode').get();
  const foreignKeys = db.prepare('PRAGMA foreign_keys').get();
  const table = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pages'",
    )
    .get();
  const ftsTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pages_fts'",
    )
    .get();
  const userVersion = db.prepare('PRAGMA user_version').get().user_version;
  const indexes = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'pages'",
    )
    .all()
    .map((row) => row.name);
  const columns = db
    .prepare("PRAGMA table_info('pages')")
    .all()
    .map((row) => row.name);

  assert.equal(journalMode.journal_mode, 'wal', '数据库应使用 WAL 模式');
  assert.equal(foreignKeys.foreign_keys, 1, '应启用外键约束');
  assert.equal(table.name, 'pages', '应创建 pages 表');
  assert.equal(ftsTable.name, 'pages_fts', '应创建 FTS 索引表');
  assert.equal(userVersion, 1, '应记录 FTS 索引版本');
  assert.deepEqual(
    new Set(indexes),
    new Set(['idx_pages_parent', 'idx_pages_status', 'idx_pages_updated']),
    '应创建页边状态、更新时间和父级索引',
  );
  assert.deepEqual(
    columns,
    [
      'id',
      'parent_page_id',
      'edge_title',
      'body',
      'source',
      'parse_status',
      'companion_log',
      'guidance',
      'page_status',
      'teaching_round_count',
      'created_at',
      'updated_at',
    ],
    '页边表字段应符合数据模型',
  );
});

test('旧数据库应幂等迁移页面父级字段并保留数据', async (t) => {
  const databasePath = await createDatabasePath(t);
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE pages (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      edge_title            TEXT,
      body                  TEXT NOT NULL,
      source                TEXT,
      parse_status          TEXT NOT NULL DEFAULT 'pending',
      companion_log         TEXT,
      page_status           TEXT NOT NULL DEFAULT 'reading',
      teaching_round_count  INTEGER DEFAULT 0,
      created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  legacy
    .prepare('INSERT INTO pages (body, source) VALUES (?, ?)')
    .run('旧数据库中的页边。', '课程');
  legacy.close();

  const firstConnection = openDatabase(databasePath);
  const columns = firstConnection
    .prepare("PRAGMA table_info('pages')")
    .all()
    .map((row) => row.name);
  const page = firstConnection
    .prepare('SELECT body, parent_page_id FROM pages')
    .get();
  closeDatabase(firstConnection);

  const secondConnection = openDatabase(databasePath);
  t.after(() => closeDatabase(secondConnection));

  assert.ok(columns.includes('parent_page_id'));
  assert.ok(columns.includes('guidance'));
  assert.equal(page.body, '旧数据库中的页边。');
  assert.equal(page.parent_page_id, null);
  assert.equal(
    secondConnection.prepare('SELECT COUNT(*) AS count FROM pages').get().count,
    1,
  );
  assert.equal(
    secondConnection
      .prepare(
        'SELECT COUNT(*) AS count FROM pages_fts WHERE pages_fts MATCH ?',
      )
      .get('"旧数据库"').count,
    1,
  );
  assert.equal(
    secondConnection.prepare('PRAGMA user_version').get().user_version,
    1,
  );
});

test('FTS 行数与页面数不一致时应自动重建', async (t) => {
  const databasePath = await createDatabasePath(t);
  const firstConnection = openDatabase(databasePath);
  firstConnection
    .prepare('INSERT INTO pages (body, source) VALUES (?, ?)')
    .run('需要重建索引的页边。', '课程');
  firstConnection.exec('DELETE FROM pages_fts');
  closeDatabase(firstConnection);

  const secondConnection = openDatabase(databasePath);
  t.after(() => closeDatabase(secondConnection));

  assert.equal(
    secondConnection
      .prepare(
        'SELECT COUNT(*) AS count FROM pages_fts WHERE pages_fts MATCH ?',
      )
      .get('"重建索引"').count,
    1,
  );
});

test('重新打开数据库时应保留已有页边', async (t) => {
  const databasePath = await createDatabasePath(t);
  const firstConnection = openDatabase(databasePath);

  firstConnection
    .prepare('INSERT INTO pages (body, source) VALUES (?, ?)')
    .run('注意力像带宽。', '课程');
  closeDatabase(firstConnection);

  const secondConnection = openDatabase(databasePath);
  t.after(() => closeDatabase(secondConnection));

  const page = secondConnection
    .prepare(
      `SELECT
        body,
        source,
        page_status,
        parse_status,
        teaching_round_count,
        companion_log
      FROM pages`,
    )
    .get();

  assert.equal(page.body, '注意力像带宽。', '应保留页边正文');
  assert.equal(page.source, '课程', '应保留出处');
  assert.equal(page.page_status, 'reading', '新页边应处于在读状态');
  assert.equal(page.parse_status, 'pending', '新页边应等待解析');
  assert.equal(page.teaching_round_count, 0, '初始伴读轮次应为零');
  assert.equal(page.companion_log, null, '初始对谈记录应为空');
});

test('重复初始化表结构时应保持幂等', async (t) => {
  const databasePath = await createDatabasePath(t);
  const firstConnection = openDatabase(databasePath);
  closeDatabase(firstConnection);

  let secondConnection;
  assert.doesNotThrow(() => {
    secondConnection = openDatabase(databasePath);
  }, '重复初始化不应抛出错误');

  t.after(() => closeDatabase(secondConnection));

  const pageCount = secondConnection
    .prepare('SELECT COUNT(*) AS count FROM pages')
    .get();
  assert.equal(pageCount.count, 0, '重复初始化不应产生额外数据');
});

test('应在内存数据库中完成初始化', (t) => {
  const db = openDatabase(':memory:');
  t.after(() => closeDatabase(db));

  const table = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pages'",
    )
    .get();
  const ftsTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pages_fts'",
    )
    .get();
  const userVersion = db.prepare('PRAGMA user_version').get().user_version;

  assert.equal(table.name, 'pages', '内存数据库也应创建 pages 表');
  assert.equal(ftsTable.name, 'pages_fts', '内存数据库也应创建 FTS 表');
  assert.equal(userVersion, 1, '内存数据库也应记录 FTS 版本');
});

test('数据库文件损坏时应抛出初始化错误', async (t) => {
  const databasePath = await createDatabasePath(t);
  await writeFile(databasePath, '这不是一个 SQLite 数据库');

  assert.throws(
    () => openDatabase(databasePath),
    '损坏的数据库文件不应被静默忽略',
  );
});

test('检查点失败时仍应关闭数据库', () => {
  let closed = false;
  const database = {
    exec() {
      throw new Error('检查点失败');
    },
    close() {
      closed = true;
    },
  };

  assert.doesNotThrow(
    () => closeDatabase(database),
    '检查点失败不应阻止数据库关闭',
  );
  assert.equal(closed, true, '数据库最终应被关闭');
});
