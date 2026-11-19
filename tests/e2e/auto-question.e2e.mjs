import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { _electron as electron } from 'playwright';
import { closeDatabase, openDatabase } from '../../src/main/db/client.ts';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const currentBody = '在古尔城旁边，有一座城市，城里的居民都是盲人。';
const relatedBody = '系统基模由增强回路、调节回路和时间延迟三种基本元件构成。';
const question = '你写的盲人摸象和系统基模，能怎么互相对照？';
const requestId = 'guidance-e2e-1';

const seed = (databasePath) => {
  const db = openDatabase(databasePath);

  try {
    const insertPage = db.prepare(`
      INSERT INTO pages (
        id,
        parent_page_id,
        edge_title,
        title_source,
        body,
        source,
        parse_status,
        companion_log,
        guidance,
        page_status,
        teaching_round_count,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    const older = new Date(Date.now() - 60_000).toISOString();

    insertPage.run(
      2,
      null,
      '系统基模的三种基本元件',
      null,
      relatedBody,
      '读书笔记',
      'pending',
      null,
      null,
      'reading',
      0,
      older,
      older,
    );

    const bodyHash = createHash('sha256').update(currentBody).digest('hex');
    const guidance = {
      status: 'needed',
      suggestions: [
        {
          id: 'g-2',
          relatedPageIds: [2],
          notes: [
            {
              pageId: 2,
              title: '系统基模的三种基本元件',
              source: '读书笔记',
              excerpt: relatedBody,
            },
          ],
          why: '新笔记说不能靠部分认识整体，旧笔记说明整体由哪些元件构成。',
          question,
          requestId,
          used: true,
        },
      ],
      bodyHash,
      updatedAt: Date.now(),
    };
    const messages = [
      {
        role: 'teacher',
        text: question,
        requestId,
        createdAt: Date.now(),
      },
    ];

    insertPage.run(
      1,
      null,
      '盲人摸象',
      null,
      currentBody,
      '课程',
      'pending',
      JSON.stringify(messages),
      JSON.stringify(guidance),
      'reading',
      0,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO request_inspections (
        request_id,
        status,
        provider_id,
        model,
        messages,
        error_code,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      requestId,
      'sent',
      'custom',
      'guidance-model',
      JSON.stringify([
        {
          role: 'system',
          content: '真实的 guidance system prompt：请连接当前念头和旧念头。',
        },
        {
          role: 'user',
          content: '当前念头和旧念头正文。',
        },
      ]),
      null,
      Date.now(),
    );
  } finally {
    closeDatabase(db);
  }
};

test('自动问题、右栏和查看请求应在生产构建中可见', async (t) => {
  if (process.platform !== 'darwin') {
    t.skip('当前 E2E 只覆盖 macOS arm64 打包产物');
    return;
  }

  assert.ok(
    existsSync(path.resolve('.vite/build/main.cjs')),
    '找不到生产构建；请先运行 npm run package',
  );
  assert.ok(
    existsSync(path.resolve('.vite/renderer/main_window/index.html')),
    '找不到生产 renderer；请先运行 npm run package',
  );

  const userData = await mkdtemp(path.join(tmpdir(), 'tap-along-e2e-'));
  let app;

  t.after(async () => {
    await app?.close().catch(() => {});
    await rm(userData, { recursive: true, force: true });
  });

  seed(path.join(userData, 'tap-along.db'));
  await writeFile(
    path.join(userData, 'tap-along-settings.json'),
    JSON.stringify({ developerMode: true }),
    'utf8',
  );

  const env = {
    ...process.env,
    TAP_ALONG_E2E: '1',
    TAP_ALONG_E2E_USER_DATA: userData,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  app = await electron.launch({
    executablePath: electronPath,
    args: ['--no-sandbox', '--disable-gpu', process.cwd()],
    env,
    timeout: 30_000,
  });

  const page = await app.firstWindow();
  await page.addInitScript(() => {
    localStorage.setItem('tap-along:demo-mode', '1');
  });
  await page.reload();

  await page.getByText('盲人摸象').first().waitFor({ timeout: 20_000 });
  await page.getByText(question).first().waitFor({ timeout: 20_000 });
  await page.getByText('这次会话的念头').waitFor({ timeout: 20_000 });
  await page.getByText('系统基模的三种基本元件').first().waitFor();
  await page.getByText(relatedBody).waitFor();
  assert.equal(await page.getByText('顺着这条线问').count(), 0);

  const inspect = page.getByRole('button', { name: /查看请求/ });
  await inspect.waitFor({ timeout: 20_000 });
  await inspect.click();
  await page.getByText('发送给 LLM 的 Messages').waitFor();
  await page
    .getByText('真实的 guidance system prompt：请连接当前念头和旧念头。')
    .waitFor();
});
