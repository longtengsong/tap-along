# 最小开发任务 · FTS5 本地召回升级

**任务编号：** MINI-FTS-001

**状态：** 已实现（F1–F5 代码完成，待真机验收）

**对应完整规划：** `AI理解引导与联网问答开发任务.md` 中 Phase 1 的召回升级

**估时：** 2 人日（单人，含单测与迁移验证）

**新增依赖：** 无（使用 Electron 内置 `node:sqlite` 的 FTS5）

---

## 1. 一句话目标

把当前“最近 100 页 + JS 关键词重叠”的召回，升级为 **SQLite FTS5 trigram 索引召回**：

- 新建/编辑/补一句时同步索引；
- 引导判定前用 FTS5 找候选，再用现有 `findRelatedNotes` 打分；
- 旧库启动时自动回填；
- UI、IPC、引导判定 prompt 全部不变。

这是一次**纯召回层升级**，不新增用户可见功能，目标是让“相关旧页”找得更准、更快，并为后续语义检索留出接口。

---

## 2. 本任务做什么、不做什么

### 2.1 做

- 新增 `pages_fts` FTS5 虚拟表，`tokenize = 'trigram'`，`rowid = pages.id`。
- 新建、改批注、补一句时同步索引；清空会话时清空索引。
- 旧库启动时按 `PRAGMA user_version` 回填一次；索引行数与页面数不一致时重建。
- 新增 `searchPagesForRetrieval`：用 FTS5 取候选，按 `bm25` 排序，排除当前页。
- 候选不足时用最近页补足，保持现有召回数量与 UI 行为。
- `GuidanceService` 改用 FTS 候选，继续复用现有 `findRelatedNotes` 打分和模型筛选。
- 中文、英文、2 字短词、特殊字符、空索引都有确定行为。
- 测试覆盖迁移、同步、召回、回退、清空。

### 2.2 不做

- 不做 embedding / 向量库。
- 不做语义检索 / hybrid 排序。
- 不替换 `findRelatedNotes` 的 n-gram 打分，只替换它的候选来源。
- 不做标题单独索引；标题仍由正文首行回退。
- 不做全文搜索 UI、搜索历史、搜索缓存。
- 不做 FTS5 的 `unicode61` 分词实验；中文继续用 trigram。
- 不改引导 prompt、IPC、卡片 UI、联网问答。
- 不做 2 字中文的 `LIKE` 召回；本期用最近页补足，下一期再评估。

---

## 3. 当前实现与改动点

### 3.1 当前链路

```text
新建笔记
  → GuidanceService.run(pageId)
  → repository.listRecentPagesForRetrieval(pageId, 100)
  → findRelatedNotes(current, pages)
       ├─ 中文 2/3 字 n-gram + 英文单词
       ├─ 同出处加权
       └─ 取前 8 条
  → GuidancePlanner（LLM 判定）
```

问题：

- 每次召回都扫最近 100 页，页面多时线性变慢。
- 只按“最近”取候选，较早但真正相关的页可能进不了候选集。
- 关键词重叠在 JS 里做，无法利用 SQLite 的倒排索引和 `bm25`。

### 3.2 目标链路

```text
新建笔记
  → GuidanceService.run(pageId)
  → extractTerms(current.body)
  → repository.searchPagesForRetrieval(pageId, terms, 100)
       ├─ FTS5 MATCH（3 字及以上词项）
       ├─ bm25 排序
       └─ 不足 5 条时用最近页补足
  → findRelatedNotes(current, candidates)   // 现有打分保持不变
  → GuidancePlanner
```

---

## 4. 最小技术方案

### 4.1 索引结构

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  body,
  source,
  tokenize = 'trigram'
);
```

- `rowid` 直接复用 `pages.id`，便于按页删除/更新。
- 只索引 `body` 和 `source`；标题不是稳定字段，不单独索引。
- `source` 为空时写入空字符串，保证列数一致。

### 4.2 回填与版本

`initializeSchema` 增加：

```text
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts ...
读取 PRAGMA user_version
如果 user_version < 1：
  DELETE FROM pages_fts
  INSERT INTO pages_fts(rowid, body, source)
  SELECT id, body, COALESCE(source, '') FROM pages
  PRAGMA user_version = 1
否则如果 pages_fts 行数 ≠ pages 行数：
  重建索引
```

- 新库：空回填，`user_version = 1`。
- 旧库：自动回填，不丢页面。
- 索引损坏/缺行：按行数不一致重建。
- `clearAll` 同时 `DELETE FROM pages_fts`。
- 不引入迁移框架；沿用现有 `CREATE IF NOT EXISTS` + `PRAGMA` 风格。

### 4.3 写操作同步

在同一事务内完成：

| 操作         | 索引动作                              |
| ------------ | ------------------------------------- |
| `create`     | 插入 `pages_fts(rowid, body, source)` |
| `editText`   | 删除旧 rowid，再插入新正文            |
| `appendText` | 删除旧 rowid，再插入合并正文          |
| `closePage`  | 不改正文，不需要动                    |
| `clearAll`   | 清空 `pages_fts`                      |
| 标题更新     | 当前没有独立标题写入，不需要动        |

- 事务内失败则整体回滚，避免页面与索引不一致。
- FTS5 是虚拟表，不参与外键级联；必须显式清理。

### 4.4 查询构造

新增：

```ts
searchPagesForRetrieval(
  excludePageId: number,
  terms: string[],
  limit = 100,
): RetrievalPage[]
```

规则：

1. 过滤长度 ≥ 3 的词项；FTS5 trigram 对 2 字词无法匹配。
2. 每个词项用双引号包住，内部 `"` 转义为 `""`，用 `OR` 连接。
3. 查询：

```sql
SELECT
  p.id,
  p.edge_title,
  p.body,
  p.source,
  p.updated_at
FROM pages_fts
JOIN pages p ON p.id = pages_fts.rowid
WHERE pages_fts MATCH ? AND p.id != ?
ORDER BY bm25(pages_fts)
LIMIT ?
```

4. 如果可用词项为空、查询抛错或结果为空：
   - 回退到 `listRecentPagesForRetrieval(excludePageId, limit)`。
5. 如果结果不足 5 条：
   - 用最近页补足，按 id 去重；
   - FTS 结果保持在前，最近页只补空位。
6. 返回结构与现有 `RetrievalPage` 一致，UI 和 `findRelatedNotes` 无感知。

### 4.5 服务层接入

`GuidanceService`：

```ts
const terms = [...extractTerms(page.body).keys()];
const pages = this.repository.searchPagesForRetrieval(pageId, terms, 100);
const candidates = findRelatedNotes(page, pages);
```

- 只替换候选来源。
- `findRelatedNotes` 仍负责词项打分、同出处加权、取前 8 条。
- 召回失败时仍走 `failed`，回退开场问题。
- 不改变 GuidancePlanner 的输入结构。

### 4.6 兼容与回退

- 如果 FTS5 建表失败（理论上不会，Electron 已实测支持），应用启动失败会暴露问题；不静默降级到旧逻辑，避免“看似正常但索引不可用”。
- 如果查询本身异常，`searchPagesForRetrieval` 回退最近页，保证引导仍可运行。
- 如果旧库 `user_version` 已是 1 但索引行数不一致，重建。
- 清空会话后，索引为空；再建新页时重新插入。

---

## 5. 任务拆解

| #   | 任务                                                  | 主要文件                                                  | 验收                                        | 估时 |
| --- | ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- | ---- |
| F1  | 建 `pages_fts`、`user_version` 回填、行数校验重建     | `db/schema.ts`、`db/client.ts`、`tests/database.test.mjs` | 新库/旧库都能启动；页面不丢；重复初始化幂等 | 0.5  |
| F2  | 写操作同步索引：create/edit/append/clearAll           | `db/pages.ts`、测试                                       | 页面与索引一致；事务回滚不留脏索引          | 0.5  |
| F3  | `searchPagesForRetrieval`：FTS 查询、bm25、补足、回退 | `db/pages.ts`、`db/search-index.ts`（可选）               | 中文/英文/短词/特殊字符/空结果都有确定结果  | 0.5  |
| F4  | `GuidanceService` 接入 FTS 候选，保留现有打分         | `services/guidance.ts`、测试                              | 引导行为不变；候选来自 FTS                  | 0.25 |
| F5  | 迁移/同步/召回/回退测试与旧用例回归                   | `tests/*`                                                 | 覆盖率达标；现有测试全绿                    | 0.25 |

合计 **2 人日**。

---

## 6. 验收清单

### 6.1 功能

1. 新建 3 条旧页，其中一条与当前笔记共享 3 字以上中文词：
   - `searchPagesForRetrieval` 返回该页；
   - 当前页被排除；
   - 引导卡片仍能正常出现。
2. 编辑旧页，把关键词删掉：
   - 旧词不再能召回该页；
   - 新词可以召回。
3. 补一句旧页：
   - 合并后的正文进入索引；
   - 旧正文关键词仍可召回（因为正文保留）。
4. 2 字中文查询：
   - FTS 不匹配时回退最近页；
   - 引导不报错，最多是候选质量下降。
5. 英文关键词、引号、`*`、`"` 等特殊字符：
   - 查询不抛错；
   - 不产生 FTS 语法错误。
6. 清空全部会话：
   - `pages` 为空；
   - `pages_fts` 为空；
   - 再建页后索引可正常写入。
7. 旧库启动：
   - 自动回填；
   - 旧页可被召回；
   - `user_version = 1`。
8. 新增页/编辑/补一句后：
   - `pages_fts` 行数与 `pages` 一致；
   - 索引正文与页面正文一致。

### 6.2 兼容

- 引导卡片、不追问、点击提问、失败回退行为不变。
- 联网问答完全不改。
- IPC、preload、渲染层不改。
- 浏览器 mock 不受影响。
- 旧 `pages`/`guidance` 数据不丢。

### 6.3 质量

- `npm test` 全绿；主进程覆盖率 ≥ 90%。
- `tsc --noEmit`、`oxlint`、`oxfmt --check` 通过。
- 无新增运行时依赖。
- 在 Electron 45 / Node 24 的 `node:sqlite` 中验证 FTS5 trigram、`bm25()`、按 `rowid` 删除。

---

## 7. 测试清单

### 7.1 新增单测

- `tests/database.test.mjs`
  - 新建库包含 `pages_fts` 虚拟表；
  - `user_version = 1`；
  - 旧库回填；
  - 行数不一致时重建；
  - 重复初始化幂等。
- `tests/pages-repository.test.mjs`
  - create/edit/append 后索引正文同步；
  - clearAll 清空索引；
  - 事务失败时索引不残留。
- `tests/fts-retrieval.test.mjs`
  - 3 字中文召回；
  - 英文单词召回；
  - 2 字词回退最近页；
  - 当前页排除；
  - bm25 排序稳定；
  - 不足 5 条时补足；
  - 特殊字符不抛错；
  - 编辑后旧词失效/新词生效；
  - 空库。
- `tests/guidance-service.test.mjs`
  - 断言调用 `searchPagesForRetrieval`；
  - 候选仍经过 `findRelatedNotes`；
  - 召回异常回退 `failed`。
- `tests/guidance-repository.test.mjs`
  - 检索方法参数校验和回退。

### 7.2 回归

- 现有 guidance 55 条左右测试保持通过。
- 现有 teacher / research / settings 测试保持通过。
- `findRelatedNotes` 的打分测试保持不变。
- 旧数据库迁移测试保持通过。

---

## 8. 风险与边界

| 风险                         | 影响               | 处理                                                 |
| ---------------------------- | ------------------ | ---------------------------------------------------- |
| FTS5 trigram 不支持 2 字中文 | 短词召回差         | 2 字词回退最近页；不做 LIKE，避免查询膨胀            |
| FTS 索引与页面正文不一致     | 召回旧内容         | 同事务同步；启动行数校验；测试覆盖                   |
| 旧库回填耗时                 | 启动变慢           | 一次性回填；`user_version` 控制；单用户本地库可接受  |
| FTS 查询语法注入             | 查询报错           | 词项加引号、内部引号转义；特殊字符测试               |
| 虚拟表不参与外键             | 删除后残留         | `clearAll` 显式删除；按 rowid 维护                   |
| 行数一致但内容过期           | 极端情况召回旧内容 | 本期只处理本版本内同步；后续可加 `content_hash`      |
| 改召回后引导行为变化         | 卡片质量波动       | 保留 `findRelatedNotes` 打分；FTS 只做候选；A/B 手测 |
| 启动建表失败                 | 应用打不开         | 直接暴露错误，不静默降级；保留旧库备份建议           |

---

## 9. 与上一任务、后续的关系

```text
MINI-GUIDE-001（已完成）
  → 新建笔记后的理解引导
  → 当前：最近 100 页 + JS 关键词重叠

MINI-FTS-001（本任务）
  → FTS5 trigram 索引
  → 候选召回更准、更早的页也能进来
  → UI / prompt / 引导行为不变

MINI-RESEARCH-001（已完成）
  → 显式提问 + 联网回答
  → 本任务不碰

后续（按需）
  → 2 字中文 LIKE / 分词策略
  → embedding / hybrid 召回
  → 引导编辑后自动重跑
```

**为什么先做这个：** 它只有 2 人日，不改用户界面，却能直接改善已经上线的理解引导；联网问答已经完成，下一步不必再扩大网络面。

---

## 10. 待确认

1. **FTS 只做候选召回，还是连排序一起替换？**
   - 建议：只做候选召回，保留现有 `findRelatedNotes` 打分。改动最小，行为最可控。
2. **2 字中文要不要本期用 `LIKE` 兜底？**
   - 建议：本期不做，回退最近页；下一期用评测决定是否加 LIKE 或改分词。
3. **旧库回填是否允许阻塞启动？**
   - 建议：允许一次性阻塞；单用户本地库，页面量有限。若后续页面很多，再改成后台回填。
