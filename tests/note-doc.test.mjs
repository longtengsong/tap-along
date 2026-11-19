import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendTextToDoc,
  cloneNoteDoc,
  collectNoteImageIds,
  hasPendingNoteImages,
  countNoteImages,
  createEmptyNoteDoc,
  derivePlainText,
  docFromPlainText,
  parseNoteDoc,
  serializeStoredNoteDoc,
  storedDocFromJson,
  stripPendingImages,
} from '../src/shared/note-doc.ts';

const text = (value) => ({ type: 'text', text: value });
const paragraph = (...content) => ({
  type: 'paragraph',
  ...(content.length > 0 ? { content } : {}),
});
const image = (imageId, alt) => ({
  type: 'noteImage',
  attrs: {
    imageId,
    ...(alt !== undefined ? { alt } : {}),
  },
});
const noteDoc = (...content) => ({ type: 'doc', content });

test('空文档应可创建并派生空正文', () => {
  const doc = createEmptyNoteDoc();

  assert.deepEqual(doc, noteDoc(paragraph()));
  assert.equal(derivePlainText(doc), '');
});

test('纯文本应保留段落和换行', () => {
  assert.equal(
    derivePlainText(
      noteDoc(paragraph(text('第一行')), paragraph(text('第二行'))),
    ),
    '第一行\n第二行',
  );
  assert.equal(
    derivePlainText(
      noteDoc(
        paragraph(text('第一行')),
        paragraph(),
        paragraph(text('第三行')),
      ),
    ),
    '第一行\n\n第三行',
  );
  assert.equal(
    derivePlainText(
      noteDoc(paragraph(text('前'), { type: 'hardBreak' }, text('后'))),
    ),
    '前\n后',
  );
});

test('图片不应进入正文，图片位置用空格隔开文字', () => {
  assert.equal(
    derivePlainText(
      noteDoc(paragraph(text('前文'), image('img-1'), text('后文'))),
    ),
    '前文 后文',
  );
  assert.equal(derivePlainText(noteDoc(paragraph(image('img-1')))), '');
  assert.equal(derivePlainText(noteDoc(paragraph(text('  前后  ')))), '前后');
});

test('旧正文应按行转换成文档并保持空行', () => {
  const doc = docFromPlainText('第一行\n\n第二行');

  assert.deepEqual(
    doc,
    noteDoc(paragraph(text('第一行')), paragraph(), paragraph(text('第二行'))),
  );
  assert.equal(derivePlainText(doc), '第一行\n\n第二行');
  assert.deepEqual(docFromPlainText(''), noteDoc(paragraph()));
  assert.deepEqual(
    docFromPlainText('甲\r\n乙'),
    noteDoc(paragraph(text('甲')), paragraph(text('乙'))),
  );
});

test('补一句应追加段落并保留图片', () => {
  const doc = noteDoc(paragraph(text('原文'), image('img-1')));
  const appended = appendTextToDoc(doc, '补一句\n再补一句');

  assert.equal(doc.content.length, 1);
  assert.equal(appended.content.length, 3);
  assert.deepEqual(collectNoteImageIds(appended), ['img-1']);
  assert.deepEqual(appended.content[1], paragraph(text('补一句')));
  assert.deepEqual(appended.content[2], paragraph(text('再补一句')));

  const cloned = appendTextToDoc(doc, '');
  assert.deepEqual(cloned, doc);
  assert.notEqual(cloned, doc);
});

test('图片数量与图片 id 应按规则统计', () => {
  const doc = noteDoc(
    paragraph(image('img-1')),
    paragraph(text('正文'), image('img-2'), image('img-1')),
    paragraph(image('')),
  );

  assert.equal(countNoteImages(doc), 4);
  assert.deepEqual(collectNoteImageIds(doc), ['img-1', 'img-2']);
  assert.equal(countNoteImages(null), 0);
  assert.deepEqual(collectNoteImageIds(null), []);
});

test('保存前应剔除没有 imageId 的待上传图片', () => {
  const doc = noteDoc(
    paragraph(text('文字'), image('img-1'), image('')),
    paragraph(image('')),
    paragraph({ type: 'text', text: '另一段' }, image('img-2')),
  );
  const stripped = stripPendingImages(doc);

  assert.equal(countNoteImages(stripped), 2);
  assert.deepEqual(collectNoteImageIds(stripped), ['img-1', 'img-2']);
  assert.deepEqual(
    stripped,
    noteDoc(
      paragraph(text('文字'), image('img-1')),
      paragraph(),
      paragraph({ type: 'text', text: '另一段' }, image('img-2')),
    ),
  );
});

test('合法文档应通过校验并归一化多余字段', () => {
  const result = parseNoteDoc({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '前', marks: [{ type: 'bold' }] },
          { type: 'hardBreak' },
          {
            type: 'noteImage',
            attrs: {
              imageId: ' img-1 ',
              alt: '图',
              uploadId: 'upload-1',
            },
          },
        ],
      },
      { type: 'paragraph' },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    doc: noteDoc(
      paragraph(text('前'), { type: 'hardBreak' }, image('img-1', '图')),
      paragraph(),
    ),
  });

  assert.deepEqual(parseNoteDoc({ type: 'doc', content: [] }), {
    ok: true,
    doc: noteDoc(paragraph()),
  });
});

test('非法文档应被拒绝', () => {
  const invalid = [
    null,
    undefined,
    'not-a-doc',
    [],
    {},
    { type: 'paragraph', content: [] },
    { type: 'doc' },
    { type: 'doc', content: {} },
    { type: 'doc', content: [null] },
    { type: 'doc', content: [{ type: 'heading' }] },
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: 'not-array' }],
    },
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [null] }],
    },
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'unknown' }] }],
    },
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text' }] }],
    },
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 1 }] }],
    },
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'noteImage' }] }],
    },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'noteImage', attrs: {} }],
        },
      ],
    },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'noteImage', attrs: { imageId: '' } }],
        },
      ],
    },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'noteImage', attrs: { imageId: 1 } }],
        },
      ],
    },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'noteImage', attrs: { imageId: 'img-1', alt: 1 } }],
        },
      ],
    },
  ];

  for (const value of invalid) {
    assert.deepEqual(parseNoteDoc(value), { ok: false });
  }

  assert.deepEqual(
    parseNoteDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'hardBreak' }] },
        { type: 'paragraph', content: [] },
      ],
    }),
    {
      ok: true,
      doc: noteDoc(paragraph({ type: 'hardBreak' }), paragraph()),
    },
  );
});

test('存储在 JSON 中的文档应可序列化并兼容旧格式', () => {
  const doc = noteDoc(paragraph(text('文字'), image('img-1', '图')));
  const serialized = serializeStoredNoteDoc(doc);

  assert.deepEqual(JSON.parse(serialized), { version: 1, doc });
  assert.deepEqual(storedDocFromJson(serialized), doc);
  assert.deepEqual(storedDocFromJson(JSON.stringify(doc)), doc);

  assert.equal(storedDocFromJson(null), null);
  assert.equal(storedDocFromJson(''), null);
  assert.equal(storedDocFromJson('{'), null);
  assert.equal(storedDocFromJson('null'), null);
  assert.equal(storedDocFromJson(JSON.stringify({ version: 2, doc })), null);
  assert.equal(storedDocFromJson(JSON.stringify({ version: 1 })), null);
  assert.equal(
    storedDocFromJson(
      JSON.stringify({ version: 1, doc: { type: 'doc', content: [{}] } }),
    ),
    null,
  );
});

test('克隆文档不应共享嵌套引用', () => {
  const doc = noteDoc(paragraph(text('原文'), image('img-1')));
  const cloned = cloneNoteDoc(doc);

  assert.deepEqual(cloned, doc);
  assert.notEqual(cloned, doc);
  assert.notEqual(cloned.content[0], doc.content[0]);
  assert.notEqual(cloned.content[0].content[0], doc.content[0].content[0]);

  cloned.content[0].content[0].text = '改过';
  assert.equal(doc.content[0].content[0].text, '原文');
});

test('hasPendingNoteImages 应识别未上传图片', () => {
  assert.equal(hasPendingNoteImages(docFromPlainText('正文')), false);
  assert.equal(
    hasPendingNoteImages(noteDoc(paragraph(text('正文'), image('image-1')))),
    false,
  );
  assert.equal(
    hasPendingNoteImages(noteDoc(paragraph(text('正文'), image('')))),
    true,
  );
  assert.equal(
    hasPendingNoteImages(noteDoc(paragraph(text('正文'), image('  ')))),
    true,
  );
});
