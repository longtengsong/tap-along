# 最小开发计划 04 · TipTap 正文编辑器与文档持久化（纯文字）

**编号：** MINI-IMAGE-04

**状态：** 已实现（待验收）

**依据：** [技术方案-笔记图片粘贴.md](技术方案-笔记图片粘贴.md)（v5）、[开发计划-笔记图片粘贴.md](开发计划-笔记图片粘贴.md)、[最小开发计划-03-文件存储与图片协议.md](最小开发计划-03-文件存储与图片协议.md)（已完成）

**估时：** 2.5 人日（含单测、迁移与手工 IME 验收）

**本步定位：** 把正文从 `<textarea>` 换成 TipTap 富文本编辑器，并把 `NoteDoc` 真正接入保存/编辑/草稿。**本步不插入图片**；图片节点、压缩、粘贴放到下一步。

---

## 1. 这一步要解决什么

前三步已经完成：

- 文档模型（`NoteDoc`）；
- 数据库 `body_doc` 与仓储；
- 图片文件存储、协议与 IPC。

但正文输入仍是 `<textarea>`，保存时只有 `body`，没有把 `NoteDoc` 接进 UI/store。

本步要打通：

```text
TipTap 编辑器
  → getJSON()
  → store 保存 doc
  → 主进程派生 body 并存 body_doc
  → 重启/编辑旧页面仍能读回 doc
```

完成后，用户可以在新念头/编辑念头里使用真正的富文本编辑器写纯文字；下一步只需要加图片节点。

---

## 2. 本步做 / 不做

### 2.1 做

- 安装并锁定 TipTap 依赖。
- 新增 `NoteEditor.vue`：最小 schema（`doc/paragraph/text/hardBreak`），占位符、自动聚焦、`focus()`、键盘/IME 基础行为。
- `NewPageForm` / `PageCardEditMode` 改用 `NoteEditor`；正文从 `body` 字符串改为 `NoteDoc`。
- `PageRecord` / store 增加 `doc` / `editDoc`。
- 草稿升级为 `{ version: 2, doc, source }`；旧 `{ body, source }` 自动转换。
- 保存/编辑 IPC 支持 `doc`；主进程用 `parseNoteDoc` + `derivePlainText` 派生 `body`。
- `PageSnapshot.doc` 已在 D2 就绪；本步把它接进 `toPageRecord` 和编辑流程。
- `doc_required` 映射为用户可读错误。
- 旧页面首次编辑时用 `docFromPlainText` 迁移。
- 补一句后用响应里的 `doc` 回写。
- 单测 + IME/编辑器手工验收。

### 2.2 不做

- 不加 `noteImage` 节点。
- 不做图片压缩、上传、粘贴、预览。
- 不做卡片“含图”标记、全文浮层、Lightbox。
- 不做多模态、能力检测。
- 不做导出/清理。
- 不新增文字格式（加粗/斜体/标题/列表/链接）。

---

## 3. 当前基础

- `src/shared/note-doc.ts`：`NoteDoc`、`derivePlainText`、`docFromPlainText`、`appendTextToDoc`、`parseNoteDoc`、`stripPendingImages`、`serializeStoredNoteDoc`。
- `PagesRepository` 已支持 `doc` / `body_doc` / 引用 / `doc_required`。
- `PageSnapshot.doc` 可选；CLI/IPC 仍只传 `body`。
- `NewPageForm` / `PageCardEditMode` 仍用 `AppTextArea`。
- `DraftSnapshot` 仍是 `{ body, source }`。

---

## 4. TipTap 依赖

```text
@tiptap/vue-3
@tiptap/core
@tiptap/pm
@tiptap/extension-document
@tiptap/extension-paragraph
@tiptap/extension-text
@tiptap/extension-hard-break
@tiptap/extension-placeholder
@tiptap/extension-history（TipTap 3 若改名为 undo-redo，以实际包名为准）
```

- 安装后锁定版本；先确认 Vue 3.5 / Vite 8 / Electron 能挂载最小编辑器。
- 不启用 StarterKit 的加粗/斜体/标题/列表/链接。
- 包体预计增加 150–250KB gzip。

---

## 5. NoteEditor 组件

新增 `src/renderer/note/NoteEditor.vue`：

```ts
{
  doc: NoteDoc;
  placeholder?: string;
  ariaLabel: string;
  autofocus?: boolean;
  compact?: boolean;
}
```

- Emits：`update:doc`。
- 暴露：`focus()`。
- 内部：
  ```ts
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Placeholder,
      History /* 或 UndoRedo */,
    ],
    content: props.doc,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': props.ariaLabel,
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor }) => emit('update:doc', editor.getJSON()),
  });
  ```
- 不在父组件 `watch` doc 回写编辑器；编辑器内部状态为源。
- 切换页面/草稿时用 `:key` 重新挂载。
- 外部重置草稿（开始新念头/清空数据）时，store 递增 `draftRevision`；`NewPageForm` 用它作为 `NoteEditor` 的 key，避免 contenteditable 与 store 状态打架。编辑器自己的输入不触发 remount。
- 占位符用 `Placeholder` 扩展。
- 样式：
  - 外层沿用原 textarea 的边框/背景/内边距；
  - `:deep(.ProseMirror)`：`min-height`、`outline: none`、`white-space: pre-wrap`、`word-break: break-word`；
  - 段落间距/空段落；
  - 空状态 placeholder。
- 本步 schema 不含 `noteImage`；如果 doc 里意外有图片节点，编辑器会丢弃（本步还没有图片入口，可接受；D5 加节点后处理）。

---

## 6. 组件接入

### 6.1 NewPageForm

- Props：`doc: NoteDoc`、`source`、`error`。
- Emits：`update:doc`、`update:source`、`submit`。
- 用 `NoteEditor` 替换 `AppTextArea`；`form.focus()` 调 `NoteEditor.focus()`。
- 提交时仍由 store 等待/校验；本步无图片上传。

### 6.2 PageCardEditMode

- Props：`doc: NoteDoc`。
- Emits：`update:doc`、`save`、`cancel`。
- 用 `NoteEditor` 替换 `AppTextArea`。
- `PageCard` 传 `page.editDoc`。
- `CompanionScreen` / `App.vue` 事件从 `update-edit-draft` 改为 `update-edit-doc`。

### 6.3 PageCardSummary

- 不改：仍两行 `body` 摘要。
- 本步不做图片标记/全文浮层。

---

## 7. Store 与草稿

### 7.1 类型

`src/types/session.ts`：

```ts
export interface PageRecord {
  // 现有字段...
  doc?: NoteDoc;
  editDoc?: NoteDoc;
  // 移除 editDraft: string
}
```

`src/shared/draft.ts`：

```ts
export interface DraftSnapshot {
  version: 2;
  doc: NoteDoc;
  source: string;
}
```

- `parseDraftSnapshot`：
  - v2：校验 doc/source；
  - 旧 `{ body, source }`：`docFromPlainText(body)`；
  - 非法 → null。
- `saveDraftSnapshot`：写 v2；大小上限按序列化后的字符数（`MAX_DRAFT_LENGTH` 从 100,000 提高到 2,000,000）。
- `loadDraftSnapshot` / `clearDraftSnapshot` 签名不变。

### 7.2 state

- `state.draft`：`{ doc: NoteDoc; source: string }`；初始化用 `docFromPlainText('')`，再覆盖恢复值。
- `state.draftRevision`：外部重置草稿时递增，供 `NewPageForm` 给 `NoteEditor` 做 key。
- `watch` doc/source → `saveDraftSnapshot`。
- `submitNewPage`：
  ```ts
  const body = derivePlainText(state.draft.doc).trim();
  if (!body) {
    error;
    return;
  }
  const response = await tapAlongApi.savePage({
    doc: state.draft.doc,
    body,
    source,
    parentPageId,
  });
  ```
- `completeSave`：清空 doc/source，清 draft。
- `startNewPage`：清空 doc/source。
- `clearConversationData`：清空 doc/source。
- `startEditing`：`page.editDoc = structuredClone(page.doc ?? docFromPlainText(page.body))`。
- `cancelEditing`：放弃 editDoc。
- `saveEditing`：
  ```ts
  const doc = page.editDoc!;
  const body = derivePlainText(doc).trim();
  if (!body) {
    error;
    return;
  }
  const response = await tapAlongApi.editPage(page.id, doc, requestId);
  page.body = response.page?.body ?? body;
  page.doc = response.page?.doc ?? doc;
  page.title = response.page?.title ?? extractKeyword(body);
  page.editDoc = clone(page.doc);
  ```
- `submitAppend`：用响应页的 `doc`/`body` 回写；demo 回退用 `appendTextToDoc`。
- `PageRecord.doc` 在 `toPageRecord` 中从 `page.doc` 映射；`editDoc` 初始空。

### 7.3 空正文

- 用 `derivePlainText(doc).trim()` 判断，不再用 `body` 字符串。
- 纯空白/空段落 → 报现有 `newPage.emptyError` / `INVALID_BODY`。
- 本步没有图片，所以不存在“只有图没有字”的情况。

---

## 8. IPC / API

### 8.1 页面 payload

```ts
export interface SavePagePayload {
  doc?: NoteDoc;
  body?: string; // 兼容旧客户端/测试
  source: string;
  parentPageId?: number;
}

export interface EditPagePayload {
  pageId: number;
  doc?: NoteDoc;
  body?: string;
  requestId: string;
}
```

- 新客户端传 doc + body（body 由 renderer 派生，仅作兼容）；主进程优先 doc。
- 没有 doc 时保持旧 body 行为。

### 8.2 parse

`src/main/ipc/pages.ts`：

- `parseSavePayload`：
  - doc 存在 → `parseNoteDoc`；失败 `INVALID_NOTE_DOC`；
  - `body = derivePlainText(doc).trim()`；空 → `INVALID_BODY`；
  - 返回 doc + body。
- `parseEditPayload`：
  - 同上；
  - doc 可选；无 doc 保持旧 body。
- `savePage` / `editPage` 把 doc 传给 repository。
- `editPage` 遇到 `doc_required` → `INVALID_NOTE_DOC`。
- 新增错误码 `INVALID_NOTE_DOC` + 中英文文案。

### 8.3 preload/API

- `Wait`：`src/preload.ts` 的 `savePage` / `editPage` payload 类型随 shared 类型更新。
- `src/api/tap-along.ts`：
  - `savePage` 透传 doc；
  - `editPage` 改为 `(pageId, doc, requestId)`（bridge 仍发 `{pageId, doc, requestId}`）；
  - `toPageRecord` 映射 `doc`；
  - demo mock 页面带 doc。
- 现有页面 API 调用点只有 store，更新即可。

---

## 9. 文件改动

```text
新增:
  src/renderer/note/NoteEditor.vue

修改:
  package.json / pnpm-lock.yaml（TipTap）
  src/components/newpage/NewPageForm.vue
  src/components/newpage/NewPageScreen.vue
  src/components/companion/PageCard/PageCard.vue
  src/components/companion/PageCard/PageCardEditMode.vue
  src/components/companion/CompanionScreen.vue
  src/App.vue
  src/types/session.ts
  src/stores/session.ts
  src/shared/draft.ts
  src/shared/pages.ts
  src/shared/errors.ts
  src/main/ipc/pages.ts
  src/preload.ts
  src/api/tap-along.ts
  src/i18n/locales/zh-CN.json
  src/i18n/locales/en.json
  tests/draft.test.mjs
  tests/pages-ipc.test.mjs
```

不修改 DB/图片协议/图片 IPC。

---

## 10. 测试计划

### 10.1 共享/草稿

- `tests/draft.test.mjs`：
  - v2 `{version,doc,source}` 往返；
  - 旧 `{body,source}` 转 doc；
  - 空 doc/非法 doc/超长降级；
  - 清空。
- `tests/note-doc.test.mjs` 保持通过。

### 10.2 IPC

- `tests/pages-ipc.test.mjs`：
  - save 带 doc → 派生 body、doc 透传；
  - 非法 doc → `INVALID_NOTE_DOC`；
  - doc 为空/空白 → `INVALID_BODY`；
  - edit 带 doc → 透传；
  - `doc_required` → `INVALID_NOTE_DOC`；
  - 旧 body-only 路径不变。

### 10.3 仓储

- 现有 D2 测试已覆盖 doc 创建/编辑/补一句/引用；本步不改仓储。
- 全量回归。

### 10.4 UI / 手工

- `NoteEditor` 组件测试（若 happy-dom 支持 ProseMirror）：
  - 初始 doc 渲染；
  - 输入触发 update:doc；
  - 空态 placeholder；
  - focus。
- 如果 happy-dom 不稳定，改用 E2E/手工，并在计划里注明。
- 手工重点：
  - 中文 IME（composition）输入；
  - 撤销/重做；
  - Enter / Shift+Enter；
  - 粘贴纯文本；
  - 切换页面/草稿恢复；
  - 窄屏/键盘 Tab。

### 10.5 E2E

- 新建 → 输入文字 → 保存 → 重启 → 编辑 → 正文仍正确。
- 旧纯文本念头 → 编辑 → 保存 → `body_doc` 写入。
- 草稿恢复（新页面写一半 → 重启）。
- 本步不测图片。

---

## 11. 验收标准

- [ ] TipTap 依赖安装并锁定；应用可启动。
- [ ] 新建/编辑正文使用 `NoteEditor`，不再用 `AppTextArea`。
- [ ] 中文 IME、撤销/重做、Enter/Shift+Enter、纯文本粘贴正常。
- [ ] 保存写 `body_doc`，`body` 由 doc 派生；重启后 doc 读回。
- [ ] 旧页面首次编辑迁移为 doc。
- [ ] 草稿 v2 保存/恢复；旧草稿自动转换。
- [ ] `doc_required` 映射为 `INVALID_NOTE_DOC`。
- [ ] 全量 `npm test`、typecheck、oxlint、本步格式检查通过。
- [ ] 未加图片节点/压缩/上传；未改 DB/图片协议。

---

## 12. 风险与边界

| 风险                            | 影响                   | 处理                                          |
| ------------------------------- | ---------------------- | --------------------------------------------- |
| TipTap 与 Vue/Electron 集成问题 | 编辑器不可用           | 先做最小挂载 POC；M1 结束前 go/no-go          |
| 中文 IME / contenteditable 回归 | 输入体验变差           | 不在 composition 期间重设 DOM；手工重点验收   |
| happy-dom 不支持 ProseMirror    | 单测不足               | 组件测试降级为 E2E/手工；纯逻辑已单测         |
| 草稿旧格式迁移                  | 恢复丢失               | parse 兼容旧 `{body,source}`；单测            |
| doc/body 不一致                 | FTS/标题错误           | 主进程统一派生 body；保存不信任 renderer body |
| 旧页面编辑无 doc                | 图片文档被覆盖（未来） | 本步无图片；`doc_required` 已预留             |
| 现有测试                        | 回归                   | doc 可选；旧 body 路径保留；分阶段全量        |
| 依赖安装                        | 阻塞                   | M0 先安装锁定；离线缓存                       |

---

## 13. 审核点（请重点看）

1. 本步只做纯文字编辑器 + doc 持久化，图片节点放到下一步，是否认可？
2. `NoteEditor` 内部状态为源、父组件只收 `update:doc`，是否认可？
3. 草稿升级为 v2 `{version,doc,source}`，旧格式自动转换，是否认可？
4. 保存/编辑 payload 同时带 doc 和 body（主进程优先 doc），是否认可？
5. 含 doc 页面无 doc 编辑 → `INVALID_NOTE_DOC`，是否认可？
6. 本步不接图片节点/压缩/上传，是否同意这个切分？

---

## 13.1 实施结果

- 新增 `src/renderer/note/NoteEditor.vue`。
- 安装并锁定 TipTap `3.33.0`（`@tiptap/vue-3`、`core`、`pm`、document/paragraph/text/hard-break/placeholder/history）。
- 新增 `tests/ui/note-editor.test.ts`、`tests/e2e/note-editor.e2e.mjs`。
- 新建页/编辑页已改用 `NoteEditor`；`NewPageForm` / `PageCardEditMode` 不再用正文 `AppTextArea`。
- `PageRecord` / store 使用 `doc` / `editDoc`；草稿升级为 v2 `{ version, doc, source }`，旧 `{ body, source }` 自动转换。
- 保存/编辑 IPC 支持 doc；主进程派生 body；`doc_required` 映射为 `INVALID_NOTE_DOC`。
- 旧页面首次编辑用 `docFromPlainText` 迁移；补一句用响应 doc 回写。
- 单元测试 **597 条通过**，UI 测试 **14 条通过**，E2E **2 条通过**。
- 覆盖率：行 97.8% / 分支 93.0% / 函数 97.8%。
- `npm run typecheck`、`oxlint`、本步文件 `oxfmt --check`、`npm run package` 通过。
- 全量 `npm run lint` 仍只被 4 个既有文件挡住（`wireframes/related-thoughts-rail.html`、`国际化文档.md`、`最小开发任务-长对谈上下文预算.md`、`高保真原型.html`）。

**实现说明：**

- 发现并修复：Vue `reactive` 的 doc 代理不能直接经 Electron IPC 结构化克隆；保存/编辑前用 `cloneNoteDoc` 转成普通对象。E2E 覆盖了“没记上”的真实回归。
- E2E 已验证：新建输入富文本 → 保存 → 查 `body_doc` → 打开整理菜单 → 改一改 → 保存 → 再查 `body_doc`。
- 中文键盘输入/E2E 已通过；**IME composition（拼音候选）仍建议人工验收**，因为 Playwright 的 `keyboard.type` 不模拟输入法候选窗。
- 撤销/重做由 TipTap History 提供；自动化未覆盖，列入人工验收。
- 本步 schema 不含 `noteImage`；图片节点在 MINI-IMAGE-05 加。

---

## 14. 完成后的下一步

**MINI-IMAGE-05 · 图片节点、压缩与粘贴上传**

范围：

- `NoteImage` TipTap 节点与节点视图；
- renderer WebP 压缩（2400/0.9）；
- 上传管理器、pending 节点；
- 粘贴图片、删除/撤销；
- 新建/编辑接入。

估时约 2.0–2.5 人日；完成后第一次能在真机粘图。

---

## 15. 实施顺序（本步内部）

```text
安装 TipTap + 最小挂载 POC
  → NoteEditor 组件
  → NewPageForm / PageCardEditMode 接入
  → type/store/draft doc
  → IPC/API doc
  → 测试 + IME 手工验收
```
