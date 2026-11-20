import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  allocateDatabasePath,
  closeDatabase,
  openDatabase,
} from '../src/main/db/client.ts';
import { RequestInspectionRepository } from '../src/main/db/request-inspections.ts';
import {
  ExportError,
  buildPageIndex,
  buildTurn,
  formatSummary,
  loadTurns,
  parseCompanionLog,
  parseExportArgs,
  parseSince,
  resolveDefaultDatabasePath,
  summarizeTurns,
} from '../tools/prompts/turn-export.mjs';

const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

const createTempDirectory = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-export-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};

const createRow = (overrides = {}) => ({
  request_id: 'request-1',
  status: 'sent',
  provider_id: 'custom',
  model: 'model',
  messages: JSON.stringify([{ role: 'user', content: '我在想注意力。' }]),
  error_code: null,
  reply: '注意力会被任务带走。你注意到了什么？',
  latency_ms: 120,
  prompt_version: 'companion-v2.0.0',
  prompt_hash: 'abc123',
  temperature: null,
  created_at: NOW - 1000,
  ...overrides,
});

const teacher = (requestId, text, extra = {}) => ({
  role: 'teacher',
  text,
  requestId,
  ...extra,
});

const user = (text) => ({ role: 'user', text });

test('解析对谈日志时应忽略非法条目并标记损坏 JSON', () => {
  assert.deepEqual(parseCompanionLog(''), { messages: [], ok: true });
  assert.deepEqual(parseCompanionLog('{坏数据'), { messages: [], ok: false });
  assert.deepEqual(parseCompanionLog('{"a":1}'), { messages: [], ok: false });

  const parsed = parseCompanionLog(
    JSON.stringify([
      teacher('r1', '问题？', { createdAt: 5 }),
      { role: 'system', text: '忽略' },
      { role: 'user', text: 42 },
      user('回答。'),
    ]),
  );

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.messages, [
    { role: 'teacher', text: '问题？', requestId: 'r1', createdAt: 5 },
    { role: 'user', text: '回答。' },
  ]);
});

test('应根据老师消息之后的第一件事推导回合上下文', () => {
  const { byRequestId, warnings } = buildPageIndex([
    {
      id: 1,
      page_status: 'reading',
      companion_log: JSON.stringify([
        user('之前的问题。'),
        teacher('r-continued', '然后呢？'),
        user('然后这样。'),
      ]),
    },
    {
      id: 2,
      page_status: 'reading',
      companion_log: JSON.stringify([
        teacher('r-edited', '改了什么？'),
        { role: 'maintenance', text: '', actionType: 'edited_note' },
        user('后来才回答。'),
      ]),
    },
    {
      id: 3,
      page_status: 'closed',
      companion_log: JSON.stringify([teacher('r-closed', '先到这里？')]),
    },
    {
      id: 4,
      page_status: 'reading',
      companion_log: '{bad json',
    },
  ]);

  const continued = byRequestId.get('r-continued');
  assert.equal(continued.pageId, 1);
  assert.equal(continued.nextUserText, '然后这样。');
  assert.equal(continued.hasUserEvent, true);
  assert.equal(continued.previousUserText, '之前的问题。');

  const edited = byRequestId.get('r-edited');
  assert.equal(edited.hasUserEvent, false);
  assert.equal(edited.actionType, 'edited_note');
  assert.equal(edited.nextUserText, '后来才回答。');

  const closed = byRequestId.get('r-closed');
  assert.equal(closed.pageStatus, 'closed');

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /页面 4/);

  const turn = buildTurn(createRow(), continued, { now: NOW });
  assert.equal(turn.outcome, 'continued');
  assert.equal(turn.language, 'zh');
  assert.deepEqual(turn.ruleFailures, []);
  assert.equal(turn.inferred, true);
  assert.equal(turn.incomplete, false);
});

test('应区分编辑、另起一页、合上、放弃和未知状态', () => {
  const base = {
    pageId: 1,
    pageStatus: 'reading',
    nextUserText: null,
    previousUserText: null,
    teacherMessageCreatedAt: NOW,
  };
  const build = (context, rowOverrides = {}) =>
    buildTurn(createRow(rowOverrides), { ...base, ...context }, { now: NOW })
      .outcome;

  assert.equal(build({ hasUserEvent: true }), 'continued');
  assert.equal(
    build({ hasUserEvent: false, actionType: 'edited_note' }),
    'edited',
  );
  assert.equal(build({ hasUserEvent: false, actionType: 'forked' }), 'forked');
  assert.equal(
    build({ hasUserEvent: false, actionType: 'appended_note' }),
    'continued',
  );
  assert.equal(build({ hasUserEvent: false, actionType: 'end' }), 'closed');
  assert.equal(build({ hasUserEvent: false, pageStatus: 'closed' }), 'closed');
  assert.equal(
    build(
      { hasUserEvent: false, teacherMessageCreatedAt: NOW - 2 * DAY },
      { created_at: NOW - 2 * DAY },
    ),
    'abandoned',
  );
  assert.equal(build({ hasUserEvent: false }), 'unknown');
});

test('规则失败与不完整回合应被标记', () => {
  const context = buildPageIndex([
    {
      id: 1,
      page_status: 'reading',
      companion_log: JSON.stringify([
        user('我在想注意力。'),
        teacher('r1', '你注意到了什么？'),
      ]),
    },
  ]).byRequestId.get('r1');

  const failing = buildTurn(createRow({ reply: '你好？还有呢？' }), context, {
    now: NOW,
  });
  assert.equal(
    failing.ruleFailures.some((failure) => failure.rule === 'question_count'),
    true,
  );

  const english = buildTurn(
    createRow({ reply: 'What did you notice?' }),
    context,
    { now: NOW },
  );
  assert.equal(
    english.ruleFailures.some((failure) => failure.rule === 'language'),
    true,
  );

  const incomplete = buildTurn(
    createRow({ reply: null, messages: '[]' }),
    context,
    { now: NOW },
  );
  assert.equal(incomplete.incomplete, true);
  assert.deepEqual(incomplete.ruleFailures, []);
});

test('汇总应统计状态、outcome、语言和规则失败', () => {
  const summary = summarizeTurns([
    {
      status: 'sent',
      outcome: 'continued',
      language: 'zh',
      incomplete: false,
      ruleFailures: [{ rule: 'question_count' }],
    },
    {
      status: 'failed',
      outcome: 'unknown',
      language: null,
      incomplete: true,
      ruleFailures: [],
    },
  ]);

  assert.equal(summary.total, 2);
  assert.equal(summary.incomplete, 1);
  assert.equal(summary.turnsWithFailures, 1);
  assert.deepEqual(summary.byStatus, { sent: 1, failed: 1 });
  assert.deepEqual(summary.ruleFailureCounts, { question_count: 1 });
  assert.match(formatSummary(summary), /回合总数：2/);
});

test('参数解析应支持默认值、过滤和错误提示', () => {
  assert.deepEqual(parseExportArgs([]), {
    dbPath: null,
    outPath: null,
    onlyFailures: false,
    includeMessages: true,
    since: null,
    limit: null,
    help: false,
  });

  const options = parseExportArgs([
    '--db',
    '/tmp/a.db',
    '--out',
    '/tmp/a.jsonl',
    '--only-failures',
    '--no-messages',
    '--since',
    '2026-10-01',
    '--limit',
    '20',
  ]);

  assert.equal(options.dbPath, '/tmp/a.db');
  assert.equal(options.outPath, '/tmp/a.jsonl');
  assert.equal(options.onlyFailures, true);
  assert.equal(options.includeMessages, false);
  assert.equal(options.limit, 20);
  assert.equal(new Date(options.since).getFullYear(), 2026);

  assert.throws(() => parseExportArgs(['--limit', '0']), ExportError);
  assert.throws(() => parseExportArgs(['--db']), ExportError);
  assert.throws(() => parseExportArgs(['--nope']), ExportError);
  assert.throws(() => parseSince('不是日期'), ExportError);
});

test('默认数据库路径应优先使用存在的候选文件', async (t) => {
  const directory = await createTempDirectory(t);
  const configHome = path.join(directory, 'config');
  const existing = path.join(configHome, 'TapAlong', 'tap-along.db');
  await mkdir(path.dirname(existing), { recursive: true });
  await writeFile(existing, '');

  assert.equal(
    resolveDefaultDatabasePath({
      platform: 'linux',
      env: { XDG_CONFIG_HOME: configHome },
      home: directory,
    }),
    existing,
  );

  assert.throws(
    () =>
      resolveDefaultDatabasePath({
        platform: 'linux',
        env: { XDG_CONFIG_HOME: path.join(directory, 'missing') },
        home: directory,
      }),
    ExportError,
  );
});

test('应从临时数据库导出回合并支持过滤', async (t) => {
  const directory = await createTempDirectory(t);
  const databasePath = allocateDatabasePath(directory);
  const db = openDatabase(databasePath);

  db.prepare(
    `INSERT INTO pages (id, body, page_status, companion_log)
     VALUES (?, ?, ?, ?)`,
  ).run(
    1,
    '注意力有限。',
    'reading',
    JSON.stringify([
      user('我在想注意力。'),
      teacher('r-ok', '注意力会被任务带走。你注意到了什么？', {
        createdAt: NOW - 2000,
      }),
      user('它会被任务带走。'),
      teacher('r-bad', '你好？还有呢？', { createdAt: NOW - 1000 }),
    ]),
  );

  const repository = new RequestInspectionRepository(db);
  repository.save({
    requestId: 'r-ok',
    status: 'sent',
    providerId: 'custom',
    model: 'model',
    messages: [{ role: 'user', content: '我在想注意力。' }],
    reply: '注意力会被任务带走。你注意到了什么？',
    latencyMs: 100,
    promptVersion: 'companion-v2.0.0',
    promptHash: 'abc123',
    createdAt: NOW - 2000,
  });
  repository.save({
    requestId: 'r-bad',
    status: 'sent',
    providerId: 'custom',
    model: 'model',
    messages: [{ role: 'user', content: '我在想注意力。' }],
    reply: '你好？还有呢？',
    latencyMs: 200,
    createdAt: NOW - 1000,
  });
  repository.save({
    requestId: 'r-missing',
    status: 'sent',
    providerId: 'custom',
    model: 'model',
    messages: [{ role: 'user', content: '无上下文。' }],
    reply: '没有上下文。这是问题？',
    createdAt: NOW - 500,
  });
  closeDatabase(db);

  const all = await loadTurns({ dbPath: databasePath, now: NOW });
  assert.equal(all.turns.length, 3);
  assert.equal(all.summary.total, 3);
  assert.equal(all.summary.turnsWithFailures, 1);
  assert.equal(all.turns[0].outcome, 'continued');
  assert.equal(all.turns[2].pageId, null);
  assert.equal(all.turns[2].outcome, 'unknown');
  assert.equal(all.warnings.length, 1);
  assert.match(all.warnings[0], /r-missing/);

  const failures = await loadTurns({
    dbPath: databasePath,
    onlyFailures: true,
    now: NOW,
  });
  assert.deepEqual(
    failures.turns.map((turn) => turn.requestId),
    ['r-bad'],
  );

  const limited = await loadTurns({
    dbPath: databasePath,
    limit: 2,
    now: NOW,
  });
  assert.deepEqual(
    limited.turns.map((turn) => turn.requestId),
    ['r-bad', 'r-missing'],
  );

  const withoutMessages = await loadTurns({
    dbPath: databasePath,
    includeMessages: false,
    now: NOW,
  });
  assert.equal('messages' in withoutMessages.turns[0], false);

  const since = await loadTurns({
    dbPath: databasePath,
    since: NOW - 1500,
    now: NOW,
  });
  assert.deepEqual(
    since.turns.map((turn) => turn.requestId),
    ['r-bad', 'r-missing'],
  );
});

test('旧库缺少采集列时仍应导出并标记不完整', async (t) => {
  const directory = await createTempDirectory(t);
  const databasePath = allocateDatabasePath(directory);
  const legacy = new DatabaseSync(databasePath);

  legacy.exec(
    'CREATE TABLE pages (id INTEGER PRIMARY KEY, page_status TEXT, companion_log TEXT)',
  );
  legacy.exec(`
    CREATE TABLE request_inspections (
      request_id  TEXT PRIMARY KEY,
      status      TEXT NOT NULL,
      provider_id TEXT,
      model       TEXT,
      messages    TEXT NOT NULL,
      error_code  TEXT,
      created_at  INTEGER NOT NULL
    )
  `);
  legacy
    .prepare(
      'INSERT INTO pages (id, page_status, companion_log) VALUES (?, ?, ?)',
    )
    .run(
      1,
      'reading',
      JSON.stringify([teacher('r-legacy', '旧回复？'), user('继续。')]),
    );
  legacy
    .prepare(
      `INSERT INTO request_inspections
        (request_id, status, provider_id, model, messages, error_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run('r-legacy', 'sent', 'custom', 'model', '[]', null, NOW - 1000);
  legacy.close();

  const result = await loadTurns({ dbPath: databasePath, now: NOW });
  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0].reply, null);
  assert.equal(result.turns[0].outcome, 'continued');
  assert.equal(result.turns[0].incomplete, true);
});

test('空库应导出零条记录', async (t) => {
  const directory = await createTempDirectory(t);
  const databasePath = allocateDatabasePath(directory);
  closeDatabase(openDatabase(databasePath));

  const result = await loadTurns({ dbPath: databasePath, now: NOW });
  assert.deepEqual(result.turns, []);
  assert.equal(result.summary.total, 0);
});

test('缺少或损坏的数据库应给出可读错误', async (t) => {
  const directory = await createTempDirectory(t);
  const missing = allocateDatabasePath(directory);

  await assert.rejects(
    () => loadTurns({ dbPath: missing }),
    (error) =>
      error instanceof ExportError && /找不到数据库文件/.test(error.message),
  );

  await writeFile(missing, '这不是数据库');
  await assert.rejects(
    () => loadTurns({ dbPath: missing }),
    (error) =>
      error instanceof ExportError && /读取数据库失败/.test(error.message),
  );
});
