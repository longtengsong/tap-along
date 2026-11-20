# 发布动作清单 · TapAlong v0.1.0 alpha

> 适用：D0 首发与 D+1–D+7 维护；附 D+8–D+15 的排期。
> 原则：**仓库没公开、Release 没建、干净环境没跑通，就不发。** 不追 star，追“他用它做了什么”。

## 0. 硬门槛（全部打勾才允许 D0）

- [ ] 仓库已 push 到公开地址，默认分支与仓库实际一致（当前工作区为 `master`，以 push 后设置为准），许可证、README、PRIVACY、CHANGELOG 正常渲染。
- [ ] `v0.1.0` tag 已推送；GitHub Release 已建，勾选 **pre-release**。
- [ ] Release **不附安装包**；明确写“no signed/notarized installer, source only”。不要上传 `out/` 里的旧构建。
- [ ] 在干净 macOS 用户/虚拟机里，从 `git clone` 到 `pnpm start` 完整跑通一次（Node 24、pnpm 11.7.0）。
- [ ] 首次启动能配置模型或进入演示模式；完整闭环“记下 → 提问 → 回复 → 补一句 → 先想到这 → 翻旧念头”跑通。
- [ ] Issues、Discussions、私密安全报告三个入口都能打开；Issue 模板能正常渲染。
- [ ] 所有帖子里的 `{{REPO_URL}}` 已全部替换；没有“求 star/求转发/帮忙 upvote”。
- [ ] 截图/GIF 不含真实笔记、API Key、邮箱、姓名；视频标注“演示数据”。
- [ ] 你知道 D0 当天谁能守评论区；英文渠道有人能回。

**任一项不满足：顺延，不“先发了再说”。**

## 1. 渠道排期：间隔 3 天，每个渠道只发一次

| 波次 | 日   | 渠道            | 语言 | 内容                  | 建议时间                                   |
| ---- | ---- | --------------- | ---- | --------------------- | ------------------------------------------ |
| 1    | D0   | V2EX · 分享创造 | 中   | 文字 + 10 s GIF       | 周二–周四 09:30–10:30（北京时间）          |
| 2    | D+3  | Show HN         | 英   | 标题 + 正文 + 评论区  | 08:00–09:00 美东（北京时间约 21:00–22:00） |
| 3    | D+6  | 少数派 / Matrix | 中   | 先 Matrix，主站另投稿 | 20:00–22:00（北京时间）                    |
| 4    | D+9  | 即刻            | 中   | 15 s 竖屏 + 短文      | 12:00–13:00 或 20:00–22:00                 |
| 5    | D+12 | r/macapps       | 英   | 文字 + GIF            | 09:00–11:00 美东                           |
| 6    | D+15 | B站 / 小红书    | 中   | 55 s 视频 + 配文      | B站 18:00–21:00；小红书 20:00–22:00        |

**为什么不是 7 天内发完**：6 个渠道 × 最少 3 天间隔 = 15 天，塞不进 7 天。本清单选择保间隔，D+8 以后的动作见 §5；D+1–D+7 只做已发渠道的维护和下一波准备。

**日期规则**：D0 选周二–周四；任何一波落在周末或长假，顺延到下一个工作日，后续整体顺延，**不压缩 3 天间隔**。

**计数口径**：B站 + 小红书算一个「短视频」渠道，同一支视频各发一次；少数派 Matrix + 主站算一个渠道，Matrix 必发，主站投稿是同一篇的可选投稿，不另写一篇。

**顺序理由**：先中文文字社区拿定性反馈 → 再 HN 接受技术质疑 → Matrix 做长文解释 → 即刻做轻量传播 → r/macapps 找 Mac 用户 → 视频最后，能引用前几轮 FAQ 和真实问题。

## 2. D-7 至 D-1：GitHub 侧准备

### 2.1 仓库设置（D-7）

- [ ] Description：`A local-first reading companion that asks questions instead of writing for you.`（GitHub 用；package.json 的 description 更短，两者不必逐字一致）
- [ ] Topics：`macos` `electron` `local-first` `notes` `reading` `privacy` `ai` `socratic` `typescript` `vue`
- [ ] 开启 Issues、Discussions；开启私密漏洞报告（Security → Advisories）。
- [ ] 社交预览图：应用图标 + 一句话，不写“AI 神器”。
- [ ] 确认 About 里的 Website 不指向不存在的页面；没有官网就留空。

### 2.2 Release（D-7）

- [ ] Tag：`v0.1.0`，目标为默认分支（当前为 `master`），版本与 `package.json` 一致。
- [ ] 标题：`v0.1.0 — experimental alpha`
- [ ] 勾选 **Set as a pre-release**。
- [ ] **不要上传** `.dmg`、`.zip`、`.app`；`out/` 里任何未签名、未在干净环境验证的构建都不要发。（GitHub 自动生成的 Source code zip 不算安装包。）
- [ ] Release notes 至少包含：
  - 一句话定位；
  - 环境要求：macOS 13+、Apple 芯片、Node 24+、pnpm 11.7.0；
  - 从源码运行的四行命令；
  - 已知限制：无签名安装包、无导入/恢复、Windows/Linux 未测试、数据模型/界面可能变；
  - 反馈入口：Issues / Discussions / 安全报告；
  - MIT。
- [ ] 记下本次 release 的 commit hash，发帖时可附。

Release notes 模板（发布时把 `{{REPO_URL}}` 换成实际地址）：

```markdown
## TapAlong v0.1.0 — experimental alpha

A local-first reading companion that asks questions instead of writing for you.
It connects a new thought with earlier ones and leaves the thinking to you.

### Requirements

- macOS 13+ on Apple silicon (arm64)
- Node.js 24+ and pnpm 11.7.0

### Run from source

git clone {{REPO_URL}}
cd tap-along
pnpm install
pnpm start

### Known limitations

- No signed or notarized installer. Source is the only supported path.
- Export exists (`backup.json` + `images/`); there is no import/restore.
- Windows and Linux are untested.
- Data model, prompts, and UI may change without migration guarantees.

### Feedback

- Bugs: Issues
- Questions/ideas: Discussions
- Security: private advisory (do not open a public issue)

MIT.
```

### 2.3 Discussions 分区（D-6）

在 Settings → General → Features 开启 Discussions，然后建：

| 分区                   | 用途                       | 规则                           |
| ---------------------- | -------------------------- | ------------------------------ |
| 📣 Announcements       | 版本、已知问题、发布更新   | 仅维护者发；不承诺时间表       |
| 🙋 Q&A                 | 安装、配置、模型供应商问题 | 每条至少一个维护者回复或指路   |
| 💡 Ideas               | 方向讨论                   | 先问“你当时在做什么”，再谈功能 |
| 🧭 How I use it        | 用户贴自己的用法           | 不要求截图；不收集笔记内容     |
| 📝 Alpha notes         | 每周状态、triage 摘要      | 只写事实和已发生的变化         |
| 🎤 Feedback interviews | 15 分钟访谈招募            | 自愿报名；不公开个人信息       |

置顶一篇 **Start here**：

```markdown
# Start here: v0.1.0 alpha

TapAlong is an experimental alpha. Before you try it:

- macOS 13+ on Apple silicon only.
- No signed installer yet. Build from source (Node 24, pnpm 11.7.0).
- Notes stay local, but note content is sent to the model provider you configure when it generates a reply.
- Export exists; import/restore does not.

What I want to learn: **what would you use it for, and where does it get in your way?**
Reply here, open an Issue for a reproducible bug, or ask in Q&A.
```

### 2.4 标签（D-6）

现有 Issue 模板会自动打 `bug` / `enhancement`，**不要删除这两个标签**；triage 时再补 `kind/*`。完整定义见 [feedback-playbook.md](feedback-playbook.md)。

| 组   | 标签                                                                                                                                                                                                     | 用途                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| kind | `kind/bug` `kind/feature` `kind/question` `kind/docs` `kind/design` `kind/compatibility`                                                                                                                 | 每条 issue 恰好一个 |
| area | `area/onboarding` `area/companion` `area/guidance` `area/conversation` `area/research` `area/editor` `area/images` `area/retrieval` `area/settings` `area/data` `area/i18n` `area/packaging` `area/a11y` | 1–2 个              |
| 流程 | `needs-info` `needs-repro` `good-first-issue` `adopted` `alpha-limitation` `deferred` `blocked` `duplicate` `wontfix` `feedback-interview`                                                               | 按状态加            |

创建后抽查 3 个模板 issue，确认标签存在、没有拼写错误。

### 2.5 反馈入口检查（D-5）

| 入口                 | 检查                                                             | 通过标准                                         |
| -------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| README「反馈与参与」 | Issues `new/choose`、Discussions、SECURITY.md（再到 advisory）   | 全部 200；无 404                                 |
| Release notes        | 同三个入口 + 已知限制                                            | 从 Release 页可点到                              |
| 置顶 Discussion      | 只问一个问题：“你会拿它做什么/哪里卡住”                          | 不是“求 star”                                    |
| Issue chooser        | bug / feature 表单可渲染；config 指向 Discussions 与私密安全报告 | 能提交测试 issue 后关闭                          |
| 安全入口             | `security/advisories/new` 登录后可打开                           | 不引导公开 issue                                 |
| 应用内               | 目前**没有**反馈按钮（已核实）                                   | alpha 可接受；若要加，另开代码任务，不在本次范围 |
| 每篇帖子             | 只有一个 CTA                                                     | 不同时要求回帖、加群、star、转发                 |

链接检查：

```bash
REPO="{{REPO_URL}}"
for u in "$REPO" "$REPO/issues/new/choose" "$REPO/discussions" \
         "$REPO/security/advisories/new" "$REPO/releases/tag/v0.1.0"; do
  printf '%s ' "$u"
  curl -s -o /dev/null -w '%{http_code}\n' -L "$u"
done
```

### 2.6 干净环境验收（D-4）

- [ ] 新建 macOS 测试账户或虚拟机；不复制本机 `node_modules`、`userData`。
- [ ] 安装 Node 24 + pnpm 11.7.0；`corepack enable`。
- [ ] `git clone {{REPO_URL}} && cd tap-along && pnpm install --frozen-lockfile && pnpm start`。
- [ ] 记录：安装耗时、首次启动是否出现配置引导、模型连接测试、一次完整闭环、导出、退出重开。
- [ ] 断网、无 Key、搜索未配置各试一次，确认错误提示可读。
- [ ] 如果失败：先修安装路径或文档，D0 顺延。

### 2.7 素材与回复包（D-3 至 D-1）

- [ ] 55 s 主视频、16:9、4:5、10 s GIF（≤10 MB）、封面 3 张、`.srt`；见 [gif-storyboard.md](gif-storyboard.md)。
- [ ] 截图标注“alpha 截图，界面会变”；不要拿 `wireframes/` 设计稿冒充运行截图。
- [ ] 回复包：三条固定回答——
  1. “为什么没有安装包？”→ 诚实说 alpha、未签名/未公证，只能源码；给四行命令和预计耗时。
  2. “数据会上传吗？”→ 本地存储；生成回应时发给用户配置的模型；无账号/同步/遥测；搜索只发关键词。
  3. “为什么它不替我写？”→ 定位是先回应、再追问、不代写；如果用户要成稿，推荐别的工具，不硬拉。
- [ ] 准备 2–3 条测试笔记，随时复现演示；不要用真实笔记。

## 3. D0：只发 V2EX

| 时间（北京时间） | 动作                                     | 完成标准                                                                   |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| 08:30            | 最后检查 Release、置顶帖、链接、GIF 大小 | 全部 200；GIF ≤10 MB                                                       |
| 09:30–10:30      | 发 V2EX「分享创造」                      | 标题/正文按 [launch-posts.md](launch-posts.md)；首段含 alpha 与 macOS 限制 |
| 发后 30 分钟内   | 回第一条评论                             | 先问“你会拿它做什么”，不辩论                                               |
| 10:30–12:00      | 每 20–30 分钟看一次                      | 所有实质问题当天有回应                                                     |
| 14:00            | GitHub triage                            | 新 issue/discussion 都有标签或回复                                         |
| 20:00            | 二次巡查                                 | 记录 5 条最有信息量的反馈                                                  |
| 22:00            | 当日小结                                 | 3 行：卡在哪、被误解什么、明天改什么                                       |

D0 **不发其他渠道**。不要请朋友集中顶帖；不要删除负面评论；不要用多个账号。

## 4. D+1 至 D+7：维护与下一波

| 日  | 动作                                                                                                          | 不做                                        |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| D+1 | 回完 V2EX 所有问题；把重复问题整理成 FAQ 草稿；给新 issue 打标签                                              | 不发新渠道；不为个别请求改定位              |
| D+2 | 30–60 分钟 triage；若同一问题出现 3 次，补 FAQ 或置顶回复；准备 Show HN 稿；搜 HN 是否已有同名帖              | 不提前发 HN                                 |
| D+3 | 08:00–09:00 美东发 Show HN；守评论区 4 小时；只回事实与技术问题                                               | 不同时发其他渠道；不请人 upvote；不删帖重发 |
| D+4 | 继续回 HN；把“为什么会用/为什么不用”的原话记进反馈日志；triage                                                | 不与嘲讽者缠斗；不承诺路线图                |
| D+5 | 准备 Matrix 稿；读 Matrix 版规；确认配图版权                                                                  | 不发                                        |
| D+6 | 发 Matrix；回评论；把高频安装问题补进置顶帖                                                                   | 不把同一篇同时贴到多个分组                  |
| D+7 | 周复盘：手工统计各渠道回复、Top 3 主题、安装失败数、访谈志愿者；在 Discussions 发一篇「第一周我们听到了什么」 | 不写“重大突破”；不公布未确定的时间表        |

**每日固定动作（30 分钟）**：09:00 看 Issues/Discussions；18:00 再看一次；新条目 48 小时内至少有一句回应；每周至少关掉/推进 3 个 `needs-info`。

## 5. D+8 至 D+15：后续排期

| 日      | 渠道         | 动作                                                   |
| ------- | ------------ | ------------------------------------------------------ |
| D+8     | —            | 准备即刻 15 s 竖屏；把 D+7 复盘里的真实问题做成 2 张图 |
| D+9     | 即刻         | 发短文 + 竖屏；链接放评论区并置顶                      |
| D+10    | —            | 回即刻；triage；准备 r/macapps 稿                      |
| D+12    | r/macapps    | 发英文帖；第一段说明 Electron 与源码安装               |
| D+13–14 | —            | 回评论；把安装问题整理成图文步骤                       |
| D+15    | B站 / 小红书 | 发 55 s 视频；B站简介放链接，小红书链接放主页/评论区   |

任何渠道审核失败或数据不佳：**顺延，不补发到其他渠道，不删帖重发**。同一渠道只发一次；补充信息只在原帖回复或编辑勘误。

## 6. 指标与停止规则

**只看这些（手工记录，不加埋点）**

- 每个渠道的实质回复数（不是点赞）。
- 明确回答“我会拿它做什么”的人数。
- 可复现 bug 数、安装失败数、被哪一步卡住。
- 愿意做 15 分钟访谈的人数。
- 因反馈而合并的文档/代码修复数。

**不要看**：star 数作为 KPI、榜单、转发量。GitHub Traffic 只有 14 天聚合，且不是全量用户；只作参考。

**首轮目标（诚实版）**：10 条“我会用它做 X”的具体回答；5 份可复现报告；3 位访谈志愿者；至少 1 个 onboarding/安装文档修复。

**停止/暂停规则**

- 超过一半回复是“装不上/没有下载”→ 暂停后续波次，先补安装说明或签名构建；不要在评论里反复解释。
- 大量“它为什么不替我写”→ 不改产品，改文案；在置顶帖加“它不做什么”。
- 出现数据丢失、密钥泄露、提示词注入逃逸 → 立即暂停所有发布，按 SECURITY.md 处理，修好后再发更新。
- 单条帖子变成骂战 → 只回一次事实，然后离开；不删帖、不拉黑式辩论。

## 7. 发布纪律

- 每个渠道只发一次；不跨版重复贴同一篇。
- 不买推广、不互换 star、不群发私信。
- 不冒充用户；不写“我朋友用了说好”。
- 引用用户原话必须征得同意并匿名；不贴用户笔记。
- 事实错误可以编辑更正，并在原帖说明“已更正”；不要悄悄改。
- 所有“以后会做”的说法都要加“不承诺时间”。

## 8. 待确认

- [ ] 仓库最终公开地址与 push 时间（当前尚未确认 push 成功）。
- [ ] D0 具体日期（避开长假、Apple 发布会、周末）。
- [ ] Discussions 是否已开启、分区是否已建。
- [ ] 少数派主站是否接受投稿；Matrix 版规是否允许 self-promotion。
- [ ] Show HN 与 r/macapps 由谁在哪个时区守评论区。
- [ ] 是否要在应用内加反馈入口（代码改动，超出本次物料范围）。
- [ ] Apple Developer 证书/公证进度；一旦有签名安装包，所有“只能源码运行”的文案都要同步改。
