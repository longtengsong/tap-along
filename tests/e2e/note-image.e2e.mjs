import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { _electron as electron } from 'playwright';
import { closeDatabase, openDatabase } from '../../src/main/db/client.ts';
import { storedDocFromJson } from '../../src/shared/note-doc.ts';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAABOUlEQVR4nO3VsQ2DQBBFwbNFCZToIiiGwAXSA04d4OcQ6TQTbrTJ039s7+0cwKXn9RkQCPxhQSAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEwjIm8Vrv/oBv+zGmYEEgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgCASCQCAIBIJAIAgEgkAgLGMS+3H3B8zIgkAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAgEgUAQCASBQBAIBIFAEAiM3z61igbj3wXeZAAAAABJRU5ErkJggg==';

const pasteFile = async (page, base64, name, type) => {
  await page.evaluate(
    ({ base64: value, name: fileName, type: mime }) => {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const file = new File([bytes], fileName, { type: mime });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const editor = document.querySelector('.ProseMirror');

      if (!editor) {
        throw new Error('editor missing');
      }

      const event = new Event('paste', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'clipboardData', { value: transfer });
      editor.dispatchEvent(event);
    },
    { base64, name, type },
  );
};

const openEditor = async (page) => {
  await page.getByRole('button', { name: '整理这个念头？' }).click();
  await page.getByRole('button', { name: '改一改' }).click();
  const editor = page.getByRole('textbox', { name: '编辑念头内容' });
  await editor.waitFor({ timeout: 20_000 });
  return editor;
};

const waitForImage = async (page, selector) => {
  await page.locator(selector).waitFor({ timeout: 20_000 });
  await page.waitForFunction(
    (target) => {
      const element = document.querySelector(target);
      return element instanceof HTMLImageElement && element.naturalWidth > 0;
    },
    selector,
    { timeout: 20_000 },
  );
};

const openFullText = async (page) => {
  await page.getByRole('button', { name: '查看全文' }).click();
  await page.locator('.full-text').waitFor({ timeout: 10_000 });
};

test('粘贴图片应压缩上传、保存引用并在重启后显示', async (t) => {
  if (process.platform !== 'darwin') {
    t.skip('当前 E2E 只覆盖 macOS arm64 打包产物');
    return;
  }

  assert.ok(
    existsSync(path.resolve('.vite/build/main.cjs')),
    '找不到生产构建；请先运行 npm run package',
  );

  const userData = await mkdtemp(path.join(tmpdir(), 'tap-along-image-e2e-'));
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
  await page.keyboard.type('图文笔记\n正文前后都有字。');
  await pasteFile(page, PNG_BASE64, 'pixel.png', 'image/png');
  await waitForImage(page, 'img[src^="tap-image://img/"]');

  await page.getByRole('textbox', { name: '出处' }).fill('课程');
  await page.getByRole('button', { name: '记下' }).click();
  await page
    .getByRole('textbox', { name: '念头内容' })
    .waitFor({ state: 'detached', timeout: 20_000 });

  const db = openDatabase(path.join(userData, 'tap-along.db'));

  let fileName;

  try {
    const pageRow = db
      .prepare('SELECT body_doc FROM pages ORDER BY id DESC LIMIT 1')
      .get();
    const doc = storedDocFromJson(pageRow.body_doc);

    assert.ok(doc, 'body_doc 应可解析');
    assert.equal(
      doc.content
        .flatMap((paragraph) => paragraph.content ?? [])
        .filter((inline) => inline.type === 'noteImage').length,
      1,
      '文档应含一个图片节点',
    );

    const imageRow = db.prepare('SELECT id, file_name FROM page_images').get();
    assert.ok(imageRow, '应写入 page_images');
    fileName = imageRow.file_name;
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM page_image_refs').get().count,
      1,
      '应写入图片引用',
    );
  } finally {
    closeDatabase(db);
  }

  const fileBytes = await readFile(path.join(userData, 'images', fileName));
  assert.equal(fileBytes.subarray(0, 4).toString(), 'RIFF');
  assert.equal(fileBytes.subarray(8, 12).toString(), 'WEBP');

  await page.getByText('含 1 张图').waitFor({ timeout: 10_000 });
  await openFullText(page);
  await waitForImage(page, '.full-text img[src^="tap-image://img/"]');
  await page.locator('.note-doc__image-button').click();
  await page.locator('.lightbox').waitFor({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await page
    .locator('.lightbox')
    .waitFor({ state: 'detached', timeout: 10_000 });
  await page.getByRole('button', { name: '收起全文' }).click();
  await page
    .locator('.full-text')
    .waitFor({ state: 'detached', timeout: 10_000 });

  await openEditor(page);
  await pasteFile(
    page,
    'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    'pixel.gif',
    'image/gif',
  );
  await page
    .getByText('这张图片的格式不支持。')
    .first()
    .waitFor({ timeout: 10_000 });

  await page.reload();
  await page.getByText('图文笔记').first().waitFor({ timeout: 20_000 });
  await page.getByText('含 1 张图').waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: '查看全文' }).click();
  await page.locator('.full-text').waitFor({ timeout: 10_000 });
  await waitForImage(page, '.full-text img[src^="tap-image://img/"]');
  await page.getByRole('button', { name: '收起全文' }).click();
  await page
    .locator('.full-text')
    .waitFor({ state: 'detached', timeout: 10_000 });
});
