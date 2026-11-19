# 最小开发计划 01 · NoteDoc 模型与纯文本投影

**编号：** MINI-IMAGE-01

**状态：** 已实现（待验收）

**依据：** [技术方案-笔记图片粘贴.md](../design/技术方案-笔记图片粘贴.md)（v5）、[开发计划-笔记图片粘贴.md](开发计划-笔记图片粘贴.md)

**估时：** 1.0 人日（含单测与回归）

**本步定位：** 开发计划 M1 的第一块地基。只做纯 TypeScript 的文档模型与工具函数，不碰数据库、不装 TipTap、不改 UI。

---

## 1. 这一步要解决什么

后面所有功能都依赖同一个「念头内容文档」：

- 编辑器输出它；
- 数据库存它；
- 正文/标题/FTS/模型上下文从它派生纯文本；
- 图片引用从它提取；
- 草稿恢复用它。

如果这个模型先定不稳，后面的 DB、编辑器、Prompt 都会反复改。所以第一步先把 **文档结构、纯文本派生规则、校验规则** 固定下来，并用单测锁死。

---

## 2. 本步做 / 不做

### 2.1 做

新增 `src/shared/note-doc.ts`：

- `NoteDoc` / `NoteParagraph` / `NoteInline` / `StoredNoteDoc` 类型。
- `derivePlainText(doc)`：文档 → 纯文本。
- `docFromPlainText(body)`：旧正文 → 文档。
- `appendTextToDoc(doc, text)`：补一句时追加段落。
- `parseNoteDoc(value)`：校验并归一化外部文档。
- `stripPendingImages(doc)`：保存前剔除上传中的图片节点。
- `countNoteImages(doc)` / `collectNoteImageIds(doc)`。
- `serializeStoredNoteDoc(doc)` / `storedDocFromJson(value)`。

新增 `tests/note-doc.test.mjs`，覆盖上述函数。

### 2.2 不做

- 不装 TipTap / ProseMirror（放到编辑器那一步；开发计划 M0 的 TipTap POC 合并到 MINI-IMAGE-04，避免第一步引入依赖）。
- 不改数据库、不改 IPC、不改 store、不改任何 Vue 组件。
- 不做图片压缩、文件存储、协议。
- 不做能力检测、模型多模态。
- 不做纯图片念头（保存阶段仍要求正文非空，本步不实现保存）。

---

## 3. 当前基础

- `src/shared/pages.ts` 已有页面快照，但正文仍是 `body: string`。
- 还没有 `NoteDoc` 类型。
- 没有任何文档/图片相关测试。

本步只新增两个文件，不改现有文件；对现有功能零行为影响。

---

## 4. 文档结构

```ts
export interface NoteDoc {
  type: 'doc';
  content: NoteParagraph[];
}

export interface NoteParagraph {
  type: 'paragraph';
  content?: NoteInline[];
}

export type NoteInline =
  | { type: 'text'; text: string }
  | { type: 'hardBreak' }
  | {
      type: 'noteImage';
      attrs: {
        imageId: string;
        alt?: string;
      };
    };

export interface StoredNoteDoc {
  version: 1;
  doc: NoteDoc;
}
```

说明：

- 与 TipTap JSON 结构保持一致：`doc → paragraph → text / hardBreak / noteImage`。
- 只允许这些节点；不加粗体、斜体、链接、列表、标题。
- 上传中的节点运行时会多出 `uploadId` / `previewUrl`；这些不是持久化字段，`parseNoteDoc` 忽略额外 attrs，`stripPendingImages` 负责剔除。
- 存库时用 `StoredNoteDoc` 包装：`{ "version": 1, "doc": {...} }`。

---

## 5. 纯文本派生规则

### 5.1 `derivePlainText`

```ts
export const derivePlainText = (doc: NoteDoc): string => {
  const paragraphs = doc.content.map((paragraph) => {
    if (!paragraph.content) {
      return '';
    }

    return paragraph.content
      .map((inline) => {
        if (inline.type === 'text') {
          return inline.text;
        }

        if (inline.type === 'hardBreak') {
          return '\n';
        }

        // 图片不进入正文文本；用空格避免前后文字粘连
        return ' ';
      })
      .join('');
  });

  return paragraphs.join('\n').trim();
};
```

规则：

- 段落之间用 `\n`。
- `hardBreak` → `\n`。
- `noteImage` → 一个空格，不输出图片 id/URL。
- 最终 `.trim()`。
- 纯图片文档 → `''`；保存阶段会拒绝（本步不处理保存）。

### 5.2 `docFromPlainText`

- 按 `\r?\n` 切行；每行一个 `paragraph`。
- 空行保留为空段落。
- 空字符串 → 一个空 `paragraph`（保证编辑器有可放置光标的位置）。
- 旧页面/旧草稿迁移用。

### 5.3 `appendTextToDoc`

- 把新文字按换行拆成多个 `paragraph`，追加到文档末尾。
- 文档里已有的图片节点保持不变。
- 空文字 → 返回原文档的深拷贝，不改变内容。

### 5.4 图片工具

```ts
export const countNoteImages = (doc?: NoteDoc | null): number;
export const collectNoteImageIds = (doc?: NoteDoc | null): string[]; // 去重、按出现顺序
```

- `countNoteImages`：统计所有 `noteImage` 节点（包括运行时的 pending 节点，供编辑态 UI 用）。
- `collectNoteImageIds`：只收集 `attrs.imageId` 非空的节点；去重、保持文档顺序；pending 节点不计入。
- 保存/发送模型前用 `collectNoteImageIds`，不会把 pending 节点算进去。

---

## 6. 校验与保存前处理

### 6.1 `parseNoteDoc(value)`

返回：

```ts
{ ok: true; doc: NoteDoc } | { ok: false }
```

校验：

1. 必须是对象；
2. `type === 'doc'`；
3. `content` 是数组；
4. 每个 block 必须是 `paragraph`；
5. `paragraph.content` 可省略，存在时必须是数组；
6. inline 只允许：
   - `text`：`text` 必须是 string；
   - `hardBreak`；
   - `noteImage`：`attrs.imageId` 必须是非空 string；`attrs.alt` 可选 string；
7. 未知节点类型 / 非法字段 → 拒绝；
8. 深度/结构固定，不做递归未知节点；
9. 归一化：丢弃额外 attrs/marks，只保留白名单字段。

不做的事：

- 不检查 imageId 是否真的存在（DB 那一步做）；
- 不检查正文是否非空（保存 IPC 那一步做）；
- 不检查图片数量（不限）。

### 6.2 `stripPendingImages`

- 递归遍历 `paragraph.content`，移除 `noteImage` 且 `attrs.imageId` 为空的节点。
- 保留其余文本/换行/图片。
- 如果某个段落被清空，保留空段落，不删除 block。
- 保存、写草稿 localStorage 前调用。

### 6.3 `serializeStoredNoteDoc` / `storedDocFromJson`

```ts
export const serializeStoredNoteDoc = (doc: NoteDoc): string =>
  JSON.stringify({ version: 1, doc } satisfies StoredNoteDoc);

export const storedDocFromJson = (value: string | null): NoteDoc | null;
```

- `storedDocFromJson` 支持：
  - `{ version: 1, doc }` 包装；
  - 直接的 `{ type: 'doc', ... }`（兼容早期数据/测试）；
  - 其它 → `null`；
- 解析后用 `parseNoteDoc` 校验；失败返回 `null`；
- 不抛异常。

---

## 7. 文件改动

```text
新增:
  src/shared/note-doc.ts
  tests/note-doc.test.mjs

修改:
  （无）
```

不新增依赖，不改 `package.json`。

---

## 8. 任务拆解

| #   | 任务                                                             | 估时 |
| --- | ---------------------------------------------------------------- | ---- |
| 1   | 类型、常量、空文档构造                                           | 0.1  |
| 2   | `derivePlainText` / `docFromPlainText` / `appendTextToDoc`       | 0.2  |
| 3   | `countNoteImages` / `collectNoteImageIds` / `stripPendingImages` | 0.15 |
| 4   | `parseNoteDoc` 校验与归一化                                      | 0.25 |
| 5   | `serializeStoredNoteDoc` / `storedDocFromJson`                   | 0.1  |
| 6   | 单测 + 回归                                                      | 0.2  |

合计 **1.0 人日**。

---

## 9. 测试计划

新增 `tests/note-doc.test.mjs`（`node:test`）：

### 9.1 纯文本往返

- 空文档 → `''`；
- 单行、多行、空行；
- `docFromPlainText` → `derivePlainText` 往返一致（去掉首尾空白后）。

### 9.2 图片投影

- 文字 + 图片 + 文字 → `"前文 后文"`（图片变空格）；
- 纯图片 → `''`；
- 图片在段首/段尾不产生多余换行。

### 9.3 图片工具

- `countNoteImages` 统计正确；
- `collectNoteImageIds` 去重、保持顺序；
- pending 节点（imageId 为空）不计入 id；
- `stripPendingImages` 保留已上传图片、移除 pending。

### 9.4 追加

- 追加单行/多行；
- 图片节点保持不变；
- 追加空字符串不变。

### 9.5 校验

- 合法文档通过；
- 拒绝：`null`、非对象、错误 `type`、content 非数组、未知 block、未知 inline、text 非 string、noteImage 缺 imageId、imageId 空串；
- 忽略额外 attrs / marks；
- `hardBreak` 通过。

### 9.6 存储包装

- `serializeStoredNoteDoc` → `storedDocFromJson` 往返；
- 直接 doc JSON 兼容；
- 非法 JSON / 非法结构返回 `null`，不抛。

### 9.7 回归

- `npm test` 全绿；
- `npm run typecheck` 通过；
- `npm run lint` 通过。

---

## 10. 验收标准

- [ ] 新增 `src/shared/note-doc.ts`，导出上述类型/函数。
- [ ] `tests/note-doc.test.mjs` 覆盖 §9 全部场景。
- [ ] `npm test` 全绿，现有测试无回归。
- [ ] `npm run typecheck`、`npm run lint` 通过。
- [ ] 不新增依赖，不改数据库/UI/IPC。
- [ ] 代码中不含 `any`（必要时用 `unknown` + 校验）。
- [ ] 文件命名、注释风格与现有 `src/shared/*.ts` 一致。

---

## 11. 风险与边界

| 风险                            | 影响                 | 处理                                                                                             |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| 与 TipTap JSON 结构不完全一致   | 编辑器接入时要返工   | 本步严格按 `doc/paragraph/text/hardBreak/noteImage` 设计；D4 接入时用真实 `getJSON()` 再校验一次 |
| 段落/换行规则和旧 `body` 不一致 | 旧页面迁移后文本变化 | 单测锁往返；D2 迁移时用真实旧页面抽样验证                                                        |
| 图片投影用空格导致文案多空格    | 标题/FTS 有细微差异  | 可接受；`trim` + 空格只用于避免前后文字粘连                                                      |
| 未知节点直接拒绝                | 未来扩展节点需迁移   | 本期 schema 固定；以后加节点时升级 `version`                                                     |
| 保存前忘记 `stripPendingImages` | pending 节点入库     | 本步提供函数；D2/D4 保存路径强制调用，单测覆盖                                                   |

---

## 12. 审核点（请重点看）

1. **文档结构**：`doc → paragraph → text / hardBreak / noteImage`，是否认可？
2. **纯文本规则**：段落 `\n`、hardBreak `\n`、图片变空格、最终 trim，是否认可？
3. **图片不进正文**：`body` 里没有 `[图片]`、没有 URL，是否认可？
4. **校验策略**：未知节点直接拒绝，不静默丢弃，是否认可？
5. **旧数据迁移**：`docFromPlainText` 按行拆段，空行保留，是否认可？
6. **存储包装**：`{ version: 1, doc }`，是否认可？

---

## 12.1 实施结果

- 新增 `src/shared/note-doc.ts`、`tests/note-doc.test.mjs`。
- `tests/note-doc.test.mjs`：11 条用例全部通过。
- 全量 `npm test`：562 条用例通过，行覆盖率 97.8%、分支 92.9%、函数 98.2%。
- `npm run typecheck`：通过。
- `oxlint`：新增文件 0 warning / 0 error。
- `oxfmt --check`：本步新增/修改的文件通过。
- 未改数据库、UI、IPC、package.json；未新增依赖。

**已知基线问题（与本步无关）：** 全量 `npm run lint` 的 `oxfmt --check` 仍会被 4 个既有文件挡住：

- `wireframes/related-thoughts-rail.html`
- `国际化文档.md`
- `最小开发任务-长对谈上下文预算.md`
- `高保真原型.html`

这 4 个文件本步未修改；是否要单独格式化，等你决定。

**实现说明：** 额外导出了 `createEmptyNoteDoc` 与 `cloneNoteDoc`，便于下一步 store/仓储构造空文档和做深拷贝；不影响原计划接口。

---

## 13. 完成后的下一步

本步通过后，下一个最小开发计划是：

**MINI-IMAGE-02 · 数据库迁移与图片引用仓储**

范围：

- `body_doc` 列迁移；
- `page_images` / `page_image_refs` 建表；
- `PagesRepository` / `PageImagesRepository` 改造；
- 引用替换、共享引用、清理查询；
- 单测 + 旧库迁移验证。

估时约 1.5 人日。

---

## 14. 实施顺序（本步内部）

```text
类型/常量
  → derivePlainText / docFromPlainText
  → appendTextToDoc
  → 图片工具 / stripPendingImages
  → parseNoteDoc
  → 存储包装
  → 单测
  → 全量回归
```
