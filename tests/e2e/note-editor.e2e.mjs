import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { _electron as electron } from 'playwright';
import { closeDatabase, openDatabase } from '../../src/main/db/client.ts';
import {
  derivePlainText,
  storedDocFromJson,
} from '../../src/shared/note-doc.ts';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const documentTitle = 'E2E 富文本文档标题';

test('新建念头应能输入富文本并持久化 body_doc', async (t) => {
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

  const userData = await mkdtemp(path.join(tmpdir(), 'tap-along-editor-e2e-'));
  let app;

  t.after(async () => {
    await app?.close().catch(() => {});
    await rm(userData, { recursive: true, force: true });
  });

  await writeFile(
    path.join(userData, 'tap-along-settings.json'),
    JSON.stringify({ developerMode: false }),
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

  const editor = page.getByRole('textbox', { name: '念头内容' });
  await editor.waitFor({ timeout: 20_000 });
  await editor.click();
  await page.keyboard.type(`${documentTitle}\n继续写一点正文。`);

  await page.getByRole('textbox', { name: '出处' }).fill('课程');
  await page.getByRole('button', { name: '记下' }).click();
  await page
    .getByRole('textbox', { name: '念头内容' })
    .waitFor({ state: 'detached', timeout: 20_000 });

  const db = openDatabase(path.join(userData, 'tap-along.db'));

  try {
    const row = db
      .prepare('SELECT body, body_doc FROM pages ORDER BY id DESC LIMIT 1')
      .get();

    assert.ok(row.body.includes(documentTitle), '正文应写入数据库');
    const doc = storedDocFromJson(row.body_doc);
    assert.ok(doc, 'body_doc 应可解析');
    assert.equal(derivePlainText(doc), row.body, 'body 应由文档派生');
    assert.ok(doc.content.length >= 2, '应保留换行后的段落');
  } finally {
    closeDatabase(db);
  }

  await page.getByRole('button', { name: '整理这个念头？' }).click();
  await page.getByRole('button', { name: '改一改' }).click();
  const editEditor = page.getByRole('textbox', { name: '编辑念头内容' });
  await editEditor.waitFor({ timeout: 20_000 });
  await editEditor.click();
  await page.keyboard.press('Meta+End');
  await page.keyboard.type('（改过）');
  await page.getByRole('button', { name: '收好这条' }).click();
  await editEditor.waitFor({ state: 'detached', timeout: 20_000 });

  const reopened = openDatabase(path.join(userData, 'tap-along.db'));

  try {
    const row = reopened
      .prepare('SELECT body, body_doc FROM pages ORDER BY id DESC LIMIT 1')
      .get();

    assert.match(row.body, /（改过）/, '编辑后的正文应写入数据库');
    const doc = storedDocFromJson(row.body_doc);
    assert.ok(doc, '编辑后的 body_doc 应可解析');
    assert.equal(derivePlainText(doc), row.body, '编辑后 body 仍由文档派生');
  } finally {
    closeDatabase(reopened);
  }
});
